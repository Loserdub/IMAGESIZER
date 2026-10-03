import { ToolMode, BrushSettings, ExportSettings } from '../types/liquify';

export interface TexturePatch {
  x: number;
  y: number;
  width: number;
  height: number;
  prevData: Uint8ClampedArray;
  nextData: Uint8ClampedArray;
}

export interface HistorySnapshot {
  uvs: Float32Array;
  mask: Float32Array;
  texturePatch?: TexturePatch;
}

export class LiquifyEngine {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  public isWebGL2 = false;

  // Source Image & Pixel/Texture Buffers
  private originalImage: HTMLImageElement | ImageBitmap | HTMLCanvasElement | null = null;
  private imageWidth = 0;
  private imageHeight = 0;
  private imageTexture: WebGLTexture | null = null;
  private originalTexture: WebGLTexture | null = null;
  private workingCanvas: HTMLCanvasElement | null = null;
  private workingCtx: CanvasRenderingContext2D | null = null;
  private originalCanvas: HTMLCanvasElement | null = null;
  private originalCtx: CanvasRenderingContext2D | null = null;
  private prevStrokeCanvas: HTMLCanvasElement | null = null;
  private prevStrokeCtx: CanvasRenderingContext2D | null = null;
  private strokeDirtyBox: { x0: number; y0: number; x1: number; y1: number } | null = null;

  // Smart Background Guard (Subject Mask)
  private subjectMaskTexture: WebGLTexture | null = null;
  private subjectMaskCanvas: HTMLCanvasElement | null = null;
  public hasSubjectMask = false;

  // Mesh Topology
  private cols = 120;
  private rows = 120;
  private numVertices = 0;
  private numIndices = 0;
  private numWireframeIndices = 0;

  // CPU Coordinates & State
  private positions = new Float32Array(0);   // [-1, 1] static clip-space
  private baseUVs = new Float32Array(0);     // [0, 1] static base coords
  public currentUVs = new Float32Array(0);  // [0, 1] deformed coords
  public maskWeights = new Float32Array(0); // [0.0 = editable, 1.0 = locked]

  // WebGL GPU Buffers
  private vertexBuffer: WebGLBuffer | null = null;
  private baseUVBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
  private compareBuffer: WebGLBuffer | null = null;
  private maskBuffer: WebGLBuffer | null = null;
  private indexBuffer: WebGLBuffer | null = null;
  private wireframeIndexBuffer: WebGLBuffer | null = null;

  // Shader Programs
  private imageProgram: WebGLProgram | null = null;
  private wireframeProgram: WebGLProgram | null = null;
  private maskProgram: WebGLProgram | null = null;

  // Attribute & Uniform Locations
  private aPositionLoc = -1;
  private aTexCoordLoc = -1;
  private aBaseUVLoc = -1;
  private uImageLoc: WebGLUniformLocation | null = null;
  private uSubjectMaskLoc: WebGLUniformLocation | null = null;
  private uBackgroundGuardLoc: WebGLUniformLocation | null = null;
  private uShowSubjectMaskPreviewLoc: WebGLUniformLocation | null = null;

  private aWireframePosLoc = -1;
  private aWireframeTexCoordLoc = -1;
  private aWireframeBaseUVLoc = -1;
  private uWireframeColorLoc: WebGLUniformLocation | null = null;

  private aMaskPosLoc = -1;
  private aMaskTexCoordLoc = -1;
  private aMaskBaseUVLoc = -1;
  private aMaskWeightLoc = -1;
  private uMaskColorLoc: WebGLUniformLocation | null = null;

  // View Settings & Overlays
  private isComparing = false;
  private currentSettings: BrushSettings = {
    size: 90,
    strength: 0.5,
    touchOffset: 45,
    enableOffset: false,
    meshOverlay: false,
    meshGridSize: 120,
    meshOpacity: 0.5,
    meshColor: '#10b981',
    showMask: true,
    maskOpacity: 0.35,
    maskColor: '#ef4444',
    smoothMode: 'skin',
    smoothSoftness: 0.6,
    backgroundGuard: false,
    backgroundGuardFeather: 4,
    showSubjectMaskPreview: false,
    hasSubjectMask: false
  };

  // Undo / Redo History Stack
  private history: HistorySnapshot[] = [];
  private historyIndex = -1;
  private maxHistory = 40;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.initGL();
  }

  private initGL() {
    const gl2 = this.canvas.getContext('webgl2', { preserveDrawingBuffer: true, alpha: false });
    if (gl2) {
      this.gl = gl2;
      this.isWebGL2 = true;
    } else {
      const gl1 = this.canvas.getContext('webgl', { preserveDrawingBuffer: true, alpha: false });
      if (!gl1) {
        console.error('[LiquifyEngine] WebGL not supported on this browser context.');
        return;
      }
      gl1.getExtension('OES_element_index_uint');
      this.gl = gl1;
      this.isWebGL2 = false;
    }

    const gl = this.gl;

    // --- Image Rendering Shader with Background Guard ---
    const vsImage = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      attribute vec2 a_baseUV;
      varying vec2 v_texCoord;
      varying vec2 v_baseUV;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
        v_baseUV = a_baseUV;
      }
    `;

    const fsImage = `
      precision mediump float;
      uniform sampler2D u_image;
      uniform sampler2D u_subjectMask;
      uniform float u_backgroundGuard;
      uniform float u_showSubjectMaskPreview;
      varying vec2 v_texCoord;
      varying vec2 v_baseUV;
      void main() {
        vec2 warpedUv = clamp(v_texCoord, 0.0, 1.0);
        vec4 warpedColor = texture2D(u_image, warpedUv);

        if (u_showSubjectMaskPreview > 0.5) {
          float m = texture2D(u_subjectMask, v_baseUV).r;
          gl_FragColor = vec4(m * 0.1, m * 0.85, m * 0.45, 1.0);
          return;
        }

        if (u_backgroundGuard > 0.5) {
          vec2 baseUv = clamp(v_baseUV, 0.0, 1.0);
          vec4 bgColor = texture2D(u_image, baseUv);
          float maskVal = texture2D(u_subjectMask, warpedUv).r;
          // Dual-Layer Composite: Warped subject renders cleanly over untouched, straight background plate!
          gl_FragColor = mix(bgColor, warpedColor, maskVal);
        } else {
          gl_FragColor = warpedColor;
        }
      }
    `;

    this.imageProgram = this.createProgram(vsImage, fsImage);
    if (this.imageProgram) {
      this.aPositionLoc = gl.getAttribLocation(this.imageProgram, 'a_position');
      this.aTexCoordLoc = gl.getAttribLocation(this.imageProgram, 'a_texCoord');
      this.aBaseUVLoc   = gl.getAttribLocation(this.imageProgram, 'a_baseUV');
      this.uImageLoc    = gl.getUniformLocation(this.imageProgram, 'u_image');
      this.uSubjectMaskLoc = gl.getUniformLocation(this.imageProgram, 'u_subjectMask');
      this.uBackgroundGuardLoc = gl.getUniformLocation(this.imageProgram, 'u_backgroundGuard');
      this.uShowSubjectMaskPreviewLoc = gl.getUniformLocation(this.imageProgram, 'u_showSubjectMaskPreview');
    }

    // --- Wireframe Mesh Overlay Shader ---
    const vsWireframe = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      attribute vec2 a_baseUV;
      void main() {
        vec2 uvDelta = a_baseUV - a_texCoord;
        vec2 clipDelta = vec2(uvDelta.x * 2.0, -uvDelta.y * 2.0);
        gl_Position = vec4(a_position + clipDelta, -0.1, 1.0);
      }
    `;

    const fsWireframe = `
      precision mediump float;
      uniform vec4 u_color;
      void main() {
        gl_FragColor = u_color;
      }
    `;

    this.wireframeProgram = this.createProgram(vsWireframe, fsWireframe);
    if (this.wireframeProgram) {
      this.aWireframePosLoc      = gl.getAttribLocation(this.wireframeProgram, 'a_position');
      this.aWireframeTexCoordLoc = gl.getAttribLocation(this.wireframeProgram, 'a_texCoord');
      this.aWireframeBaseUVLoc   = gl.getAttribLocation(this.wireframeProgram, 'a_baseUV');
      this.uWireframeColorLoc    = gl.getUniformLocation(this.wireframeProgram, 'u_color');
    }

    // --- Freeze Mask Overlay Shader ---
    const vsMask = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      attribute vec2 a_baseUV;
      attribute float a_maskWeight;
      varying float v_maskWeight;
      void main() {
        vec2 uvDelta = a_baseUV - a_texCoord;
        vec2 clipDelta = vec2(uvDelta.x * 2.0, -uvDelta.y * 2.0);
        gl_Position = vec4(a_position + clipDelta, -0.05, 1.0);
        v_maskWeight = a_maskWeight;
      }
    `;

    const fsMask = `
      precision mediump float;
      uniform vec4 u_color;
      varying float v_maskWeight;
      void main() {
        if (v_maskWeight <= 0.001) discard;
        gl_FragColor = vec4(u_color.rgb, u_color.a * v_maskWeight);
      }
    `;

    this.maskProgram = this.createProgram(vsMask, fsMask);
    if (this.maskProgram) {
      this.aMaskPosLoc      = gl.getAttribLocation(this.maskProgram, 'a_position');
      this.aMaskTexCoordLoc = gl.getAttribLocation(this.maskProgram, 'a_texCoord');
      this.aMaskBaseUVLoc   = gl.getAttribLocation(this.maskProgram, 'a_baseUV');
      this.aMaskWeightLoc   = gl.getAttribLocation(this.maskProgram, 'a_maskWeight');
      this.uMaskColorLoc    = gl.getUniformLocation(this.maskProgram, 'u_color');
    }

    this.initDefaultSubjectMask();
  }

  private initDefaultSubjectMask() {
    const gl = this.gl;
    if (!gl) return;
    if (this.subjectMaskTexture) {
      gl.deleteTexture(this.subjectMaskTexture);
    }
    this.subjectMaskTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.subjectMaskTexture);
    // 2x2 white texture (subject is 100% active by default)
    const white = new Uint8Array([255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, white);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  private createProgram(vsCode: string, fsCode: string): WebGLProgram | null {
    const gl = this.gl;
    if (!gl) return null;

    const vs = gl.createShader(gl.VERTEX_SHADER);
    if (!vs) return null;
    gl.shaderSource(vs, vsCode);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      console.error('[LiquifyEngine] Vertex shader compile error:', gl.getShaderInfoLog(vs));
      gl.deleteShader(vs);
      return null;
    }

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    if (!fs) return null;
    gl.shaderSource(fs, fsCode);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error('[LiquifyEngine] Fragment shader compile error:', gl.getShaderInfoLog(fs));
      gl.deleteShader(fs);
      return null;
    }

    const prog = gl.createProgram();
    if (!prog) return null;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[LiquifyEngine] Program link error:', gl.getProgramInfoLog(prog));
      gl.deleteProgram(prog);
      return null;
    }

    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return prog;
  }

  // ---------------------------------------------------------------------------
  // Image Loading & Mesh Setup
  // ---------------------------------------------------------------------------

  public loadImage(image: HTMLImageElement | ImageBitmap | HTMLCanvasElement, gridSize?: number) {
    const gl = this.gl;
    if (!gl) return;

    this.originalImage = image;
    this.imageWidth    = image.width;
    this.imageHeight   = image.height;

    // Working & Original 2D Canvases for texture/pixel smoothing & restoration
    this.workingCanvas = document.createElement('canvas');
    this.workingCanvas.width = image.width;
    this.workingCanvas.height = image.height;
    this.workingCtx = this.workingCanvas.getContext('2d', { willReadFrequently: true });
    this.workingCtx?.drawImage(image, 0, 0);

    this.originalCanvas = document.createElement('canvas');
    this.originalCanvas.width = image.width;
    this.originalCanvas.height = image.height;
    this.originalCtx = this.originalCanvas.getContext('2d', { willReadFrequently: true });
    this.originalCtx?.drawImage(image, 0, 0);

    this.prevStrokeCanvas = document.createElement('canvas');
    this.prevStrokeCanvas.width = image.width;
    this.prevStrokeCanvas.height = image.height;
    this.prevStrokeCtx = this.prevStrokeCanvas.getContext('2d', { willReadFrequently: true });

    const baseGrid = gridSize ?? this.currentSettings.meshGridSize ?? 120;
    this.cols = Math.max(40, Math.min(240, baseGrid));
    this.rows = Math.max(40, Math.round(this.cols * (image.height / image.width)));

    if (this.imageTexture) {
      gl.deleteTexture(this.imageTexture);
    }
    this.imageTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.workingCanvas);

    if (this.originalTexture) {
      gl.deleteTexture(this.originalTexture);
    }
    this.originalTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.originalTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.originalCanvas);

    this.subjectMaskCanvas = null;
    this.hasSubjectMask = false;
    this.currentSettings.hasSubjectMask = false;
    this.initDefaultSubjectMask();

    this.buildMesh();

    this.history = [];
    this.historyIndex = -1;
    this.strokeDirtyBox = null;
    this.saveHistoryState();

    this.render();
  }

  private buildMesh() {
    const gl = this.gl;
    if (!gl) return;

    const cols = this.cols;
    const rows = this.rows;
    this.numVertices = (cols + 1) * (rows + 1);

    this.positions   = new Float32Array(this.numVertices * 2);
    this.baseUVs     = new Float32Array(this.numVertices * 2);
    this.currentUVs  = new Float32Array(this.numVertices * 2);
    this.maskWeights = new Float32Array(this.numVertices);

    let idx = 0;
    for (let r = 0; r <= rows; r++) {
      const v = r / rows;
      const yPos = 1.0 - 2.0 * v; // WebGL clip Y: +1 top, -1 bottom
      for (let c = 0; c <= cols; c++) {
        const u = c / cols;
        const xPos = 2.0 * u - 1.0; // WebGL clip X: -1 left, +1 right

        this.positions[idx]     = xPos;
        this.positions[idx + 1] = yPos;

        this.baseUVs[idx]       = u;
        this.baseUVs[idx + 1]   = v;

        this.currentUVs[idx]     = u;
        this.currentUVs[idx + 1] = v;

        idx += 2;
      }
    }

    // Triangles
    const numQuads = cols * rows;
    this.numIndices = numQuads * 6;
    const indices = new Uint32Array(this.numIndices);
    let iIdx = 0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const p0 = r * (cols + 1) + c;
        const p1 = p0 + 1;
        const p2 = (r + 1) * (cols + 1) + c;
        const p3 = p2 + 1;
        indices[iIdx++] = p0;
        indices[iIdx++] = p2;
        indices[iIdx++] = p1;
        indices[iIdx++] = p1;
        indices[iIdx++] = p2;
        indices[iIdx++] = p3;
      }
    }

    // Wireframe Grid Lines
    const numHLines = (rows + 1) * cols;
    const numVLines = (cols + 1) * rows;
    this.numWireframeIndices = (numHLines + numVLines) * 2;
    const wireIndices = new Uint32Array(this.numWireframeIndices);
    let wIdx = 0;

    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c < cols; c++) {
        const p0 = r * (cols + 1) + c;
        wireIndices[wIdx++] = p0;
        wireIndices[wIdx++] = p0 + 1;
      }
    }
    for (let c = 0; c <= cols; c++) {
      for (let r = 0; r < rows; r++) {
        const p0 = r * (cols + 1) + c;
        wireIndices[wIdx++] = p0;
        wireIndices[wIdx++] = (r + 1) * (cols + 1) + c;
      }
    }

    // Buffers setup
    this.deleteBuffer('vertexBuffer');
    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.positions, gl.STATIC_DRAW);

    this.deleteBuffer('baseUVBuffer');
    this.baseUVBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.baseUVBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.baseUVs, gl.STATIC_DRAW);

    this.deleteBuffer('texCoordBuffer');
    this.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.currentUVs, gl.DYNAMIC_DRAW);

    this.deleteBuffer('compareBuffer');
    this.compareBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.compareBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.baseUVs, gl.STATIC_DRAW);

    this.deleteBuffer('maskBuffer');
    this.maskBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.maskBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.maskWeights, gl.DYNAMIC_DRAW);

    this.deleteBuffer('indexBuffer');
    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    this.deleteBuffer('wireframeIndexBuffer');
    this.wireframeIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.wireframeIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, wireIndices, gl.STATIC_DRAW);
  }

  private deleteBuffer(field: 'vertexBuffer' | 'texCoordBuffer' | 'baseUVBuffer' | 'compareBuffer' | 'maskBuffer' | 'indexBuffer' | 'wireframeIndexBuffer') {
    const gl = this.gl;
    if (!gl) return;
    const buf = this[field];
    if (buf) {
      gl.deleteBuffer(buf);
      this[field] = null;
    }
  }

  public updateUVBuffer() {
    const gl = this.gl;
    if (!gl || !this.texCoordBuffer) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.currentUVs);
  }

  public updateMaskBuffer() {
    const gl = this.gl;
    if (!gl || !this.maskBuffer) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.maskBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.maskWeights);
  }

  // ---------------------------------------------------------------------------
  // Smart Background Guard (Subject Mask Texture Upload)
  // ---------------------------------------------------------------------------

  public setSubjectMask(canvas: HTMLCanvasElement | null) {
    if (!canvas) {
      this.clearSubjectMask();
      return;
    }
    const gl = this.gl;
    if (!gl) return;

    this.subjectMaskCanvas = canvas;

    if (!this.subjectMaskTexture) {
      this.subjectMaskTexture = gl.createTexture();
    }
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.subjectMaskTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);

    this.hasSubjectMask = true;
    this.currentSettings.hasSubjectMask = true;
    this.currentSettings.backgroundGuard = true;
    this.render();
  }

  public setBackgroundGuard(enabled: boolean) {
    this.currentSettings.backgroundGuard = enabled;
    this.render();
  }

  public setSubjectMaskPreview(enabled: boolean) {
    this.currentSettings.showSubjectMaskPreview = enabled;
    this.render();
  }

  public clearSubjectMask() {
    this.initDefaultSubjectMask();
    this.subjectMaskCanvas = null;
    this.hasSubjectMask = false;
    this.currentSettings.hasSubjectMask = false;
    this.currentSettings.backgroundGuard = false;
    this.currentSettings.showSubjectMaskPreview = false;
    this.render();
  }

  public getImage(): HTMLImageElement | ImageBitmap | HTMLCanvasElement | null {
    return this.workingCanvas || this.originalImage;
  }

  public beginStroke() {
    this.strokeDirtyBox = null;
    if (this.workingCanvas && this.prevStrokeCtx) {
      this.prevStrokeCtx.clearRect(0, 0, this.imageWidth, this.imageHeight);
      this.prevStrokeCtx.drawImage(this.workingCanvas, 0, 0);
    }
  }

  public endStroke() {
    // Stroke completed
  }

  private sampleMaskWeightAt(u: number, v: number): number {
    const c = Math.max(0, Math.min(this.cols, Math.round(u * this.cols)));
    const r = Math.max(0, Math.min(this.rows, Math.round(v * this.rows)));
    const idx = r * (this.cols + 1) + c;
    return this.maskWeights[idx] || 0;
  }

  private relaxMeshTopology(
    normX: number,
    normY: number,
    normRadius: number,
    strength: number,
    aspect: number
  ): boolean {
    const cols = this.cols;
    const rows = this.rows;
    const current = this.currentUVs;
    const masks   = this.maskWeights;
    const r2      = normRadius * normRadius;
    let isModified = false;

    const radiusX = normRadius / aspect;
    const radiusY = normRadius;
    const cMin = Math.max(1, Math.floor((normX - radiusX) * cols));
    const cMax = Math.min(cols - 1, Math.ceil((normX + radiusX) * cols));
    const rMin = Math.max(1, Math.floor((normY - radiusY) * rows));
    const rMax = Math.min(rows - 1, Math.ceil((normY + radiusY) * rows));

    const tempUVs = new Float32Array(current);

    for (let r = rMin; r <= rMax; r++) {
      for (let c = cMin; c <= cMax; c++) {
        const vertexIndex = r * (cols + 1) + c;
        const idx = vertexIndex * 2;

        const u = current[idx];
        const v = current[idx + 1];

        const du = (u - normX) * aspect;
        const dv = v - normY;
        const dist2 = du * du + dv * dv;

        if (dist2 < r2) {
          const dist     = Math.sqrt(dist2);
          const normDist = dist / normRadius;
          const falloff  = (1.0 - normDist * normDist) * (1.0 - normDist * normDist);
          const factor   = falloff * strength * 0.4;

          const maskWeight = masks[vertexIndex];
          if (maskWeight >= 0.999) continue;
          const effectiveFactor = factor * (1.0 - maskWeight);

          const leftIdx  = (r * (cols + 1) + (c - 1)) * 2;
          const rightIdx = (r * (cols + 1) + (c + 1)) * 2;
          const topIdx   = ((r - 1) * (cols + 1) + c) * 2;
          const botIdx   = ((r + 1) * (cols + 1) + c) * 2;

          const avgU = (tempUVs[leftIdx] + tempUVs[rightIdx] + tempUVs[topIdx] + tempUVs[botIdx]) * 0.25;
          const avgV = (tempUVs[leftIdx + 1] + tempUVs[rightIdx + 1] + tempUVs[topIdx + 1] + tempUVs[botIdx + 1]) * 0.25;

          current[idx]     += (avgU - u) * effectiveFactor;
          current[idx + 1] += (avgV - v) * effectiveFactor;
          isModified = true;
        }
      }
    }

    return isModified;
  }

  private applySmoothTexture(normX: number, normY: number, normRadius: number, strength: number) {
    if (!this.workingCtx || !this.workingCanvas || !this.gl || !this.imageTexture) return;

    const imgW = this.imageWidth;
    const imgH = this.imageHeight;

    const cx = normX * imgW;
    const cy = normY * imgH;
    const radiusPx = normRadius * imgH;
    if (radiusPx < 1) return;

    const x0 = Math.max(0, Math.floor(cx - radiusPx));
    const y0 = Math.max(0, Math.floor(cy - radiusPx));
    const x1 = Math.min(imgW, Math.ceil(cx + radiusPx));
    const y1 = Math.min(imgH, Math.ceil(cy + radiusPx));
    const boxW = x1 - x0;
    const boxH = y1 - y0;
    if (boxW <= 0 || boxH <= 0) return;

    if (!this.strokeDirtyBox) {
      this.strokeDirtyBox = { x0, y0, x1, y1 };
    } else {
      this.strokeDirtyBox.x0 = Math.min(this.strokeDirtyBox.x0, x0);
      this.strokeDirtyBox.y0 = Math.min(this.strokeDirtyBox.y0, y0);
      this.strokeDirtyBox.x1 = Math.max(this.strokeDirtyBox.x1, x1);
      this.strokeDirtyBox.y1 = Math.max(this.strokeDirtyBox.y1, y1);
    }

    const srcImgData = this.workingCtx.getImageData(x0, y0, boxW, boxH);
    const srcData = srcImgData.data;
    const outData = new Uint8ClampedArray(srcData);

    const r2 = radiusPx * radiusPx;

    // Bilateral parameters for natural skin & wrinkle smoothing
    const k = Math.max(2, Math.min(6, Math.round(radiusPx * 0.08)));
    const spatialSigma = Math.max(1.5, k * 0.5);
    const twoSpatialSigma2 = 2 * spatialSigma * spatialSigma;

    const softness = this.currentSettings.smoothSoftness ?? 0.6;
    const rangeSigma = 12 + softness * 45;
    const twoRangeSigma2 = 2 * rangeSigma * rangeSigma;

    const step = k > 4 ? 2 : 1;

    for (let py = 0; py < boxH; py++) {
      const worldY = y0 + py;
      const dy = worldY - cy;
      const dy2 = dy * dy;

      for (let px = 0; px < boxW; px++) {
        const worldX = x0 + px;
        const dx = worldX - cx;
        const dist2 = dx * dx + dy2;

        if (dist2 >= r2) continue;

        const dist = Math.sqrt(dist2);
        const normDist = dist / radiusPx;
        const falloff = (1.0 - normDist * normDist) * (1.0 - normDist * normDist);
        const factor = falloff * strength * 0.85;

        const normU = worldX / imgW;
        const normV = worldY / imgH;
        const maskWeight = this.sampleMaskWeightAt(normU, normV);
        if (maskWeight >= 0.999) continue;
        const effectiveFactor = factor * (1.0 - maskWeight);
        if (effectiveFactor <= 0.005) continue;

        const centerIdx = (py * boxW + px) * 4;
        const cr = srcData[centerIdx];
        const cg = srcData[centerIdx + 1];
        const cb = srcData[centerIdx + 2];

        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let totalW = 0;

        for (let ky = -k; ky <= k; ky += step) {
          const sampleY = py + ky;
          if (sampleY < 0 || sampleY >= boxH) continue;
          const sdy2 = ky * ky;

          for (let kx = -k; kx <= k; kx += step) {
            const sampleX = px + kx;
            if (sampleX < 0 || sampleX >= boxW) continue;

            const sdist2 = kx * kx + sdy2;
            const sIdx = (sampleY * boxW + sampleX) * 4;
            const sr = srcData[sIdx];
            const sg = srcData[sIdx + 1];
            const sb = srcData[sIdx + 2];

            const dr = sr - cr;
            const dg = sg - cg;
            const db = sb - cb;
            const colorDist2 = dr * dr + dg * dg + db * db;

            const wSpatial = Math.exp(-sdist2 / twoSpatialSigma2);
            const wRange   = Math.exp(-colorDist2 / twoRangeSigma2);
            const w = wSpatial * wRange;

            sumR += sr * w;
            sumG += sg * w;
            sumB += sb * w;
            totalW += w;
          }
        }

        if (totalW > 0.0001) {
          const targetR = sumR / totalW;
          const targetG = sumG / totalW;
          const targetB = sumB / totalW;

          outData[centerIdx]     = Math.round(cr + (targetR - cr) * effectiveFactor);
          outData[centerIdx + 1] = Math.round(cg + (targetG - cg) * effectiveFactor);
          outData[centerIdx + 2] = Math.round(cb + (targetB - cb) * effectiveFactor);
        }
      }
    }

    const outImgData = new ImageData(outData, boxW, boxH);
    this.workingCtx.putImageData(outImgData, x0, y0);

    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    const rawBytes = new Uint8Array(outData.buffer, outData.byteOffset, outData.byteLength);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, boxW, boxH, gl.RGBA, gl.UNSIGNED_BYTE, rawBytes);
  }

  private applyRestoreTexture(normX: number, normY: number, normRadius: number, strength: number) {
    if (!this.workingCtx || !this.originalCtx || !this.gl || !this.imageTexture) return;

    const imgW = this.imageWidth;
    const imgH = this.imageHeight;

    const cx = normX * imgW;
    const cy = normY * imgH;
    const radiusPx = normRadius * imgH;
    if (radiusPx < 1) return;

    const x0 = Math.max(0, Math.floor(cx - radiusPx));
    const y0 = Math.max(0, Math.floor(cy - radiusPx));
    const x1 = Math.min(imgW, Math.ceil(cx + radiusPx));
    const y1 = Math.min(imgH, Math.ceil(cy + radiusPx));
    const boxW = x1 - x0;
    const boxH = y1 - y0;
    if (boxW <= 0 || boxH <= 0) return;

    if (!this.strokeDirtyBox) {
      this.strokeDirtyBox = { x0, y0, x1, y1 };
    } else {
      this.strokeDirtyBox.x0 = Math.min(this.strokeDirtyBox.x0, x0);
      this.strokeDirtyBox.y0 = Math.min(this.strokeDirtyBox.y0, y0);
      this.strokeDirtyBox.x1 = Math.max(this.strokeDirtyBox.x1, x1);
      this.strokeDirtyBox.y1 = Math.max(this.strokeDirtyBox.y1, y1);
    }

    const curImgData = this.workingCtx.getImageData(x0, y0, boxW, boxH);
    const origImgData = this.originalCtx.getImageData(x0, y0, boxW, boxH);
    const cur = curImgData.data;
    const orig = origImgData.data;

    const r2 = radiusPx * radiusPx;

    for (let py = 0; py < boxH; py++) {
      const worldY = y0 + py;
      const dy = worldY - cy;
      const dy2 = dy * dy;

      for (let px = 0; px < boxW; px++) {
        const worldX = x0 + px;
        const dx = worldX - cx;
        const dist2 = dx * dx + dy2;
        if (dist2 >= r2) continue;

        const dist = Math.sqrt(dist2);
        const normDist = dist / radiusPx;
        const falloff = (1.0 - normDist * normDist) * (1.0 - normDist * normDist);
        const factor = falloff * strength * 0.5;

        const normU = worldX / imgW;
        const normV = worldY / imgH;
        const maskWeight = this.sampleMaskWeightAt(normU, normV);
        if (maskWeight >= 0.999) continue;
        const effectiveFactor = factor * (1.0 - maskWeight);

        const idx = (py * boxW + px) * 4;
        cur[idx]     = Math.round(cur[idx]     + (orig[idx]     - cur[idx])     * effectiveFactor);
        cur[idx + 1] = Math.round(cur[idx + 1] + (orig[idx + 1] - cur[idx + 1]) * effectiveFactor);
        cur[idx + 2] = Math.round(cur[idx + 2] + (orig[idx + 2] - cur[idx + 2]) * effectiveFactor);
      }
    }

    this.workingCtx.putImageData(curImgData, x0, y0);

    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    const restoreBytes = new Uint8Array(cur.buffer, cur.byteOffset, cur.byteLength);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, boxW, boxH, gl.RGBA, gl.UNSIGNED_BYTE, restoreBytes);
  }

  // ---------------------------------------------------------------------------
  // Warping & Sculpting Logic
  // ---------------------------------------------------------------------------

  public applyWarp(
    normX: number,
    normY: number,
    normDragX: number,
    normDragY: number,
    normRadius: number,
    strength: number,
    mode: ToolMode,
    _aspectRatio?: number
  ) {
    if (!this.originalImage || mode === 'pan') return;

    const aspect = this.imageWidth / this.imageHeight;

    // Handle Smooth mode (Skin wrinkle smoothing and/or mesh contour relaxation)
    if (mode === 'smooth') {
      const smoothMode = this.currentSettings.smoothMode ?? 'skin';
      if (smoothMode === 'skin' || smoothMode === 'hybrid') {
        this.applySmoothTexture(normX, normY, normRadius, strength);
      }
      if (smoothMode === 'contour' || smoothMode === 'hybrid') {
        if (this.relaxMeshTopology(normX, normY, normRadius, strength, aspect)) {
          this.updateUVBuffer();
        }
      }
      this.render();
      return;
    }

    // Handle Reconstruct texture restoration alongside mesh restoration
    if (mode === 'reconstruct') {
      this.applyRestoreTexture(normX, normY, normRadius, strength);
    }

    const cols = this.cols;
    const rows = this.rows;
    const current  = this.currentUVs;
    const base     = this.baseUVs;
    const masks    = this.maskWeights;
    const r2       = normRadius * normRadius;
    if (r2 <= 0) return;

    let isMaskModified = false;
    let isUVModified   = false;

    // Bounding Box Spatial Optimization: only evaluate vertices within brush bounds
    const radiusX = normRadius / aspect;
    const radiusY = normRadius;
    const cMin = Math.max(0, Math.floor((normX - radiusX) * cols));
    const cMax = Math.min(cols, Math.ceil((normX + radiusX) * cols));
    const rMin = Math.max(0, Math.floor((normY - radiusY) * rows));
    const rMax = Math.min(rows, Math.ceil((normY + radiusY) * rows));

    for (let r = rMin; r <= rMax; r++) {
      for (let c = cMin; c <= cMax; c++) {
        const vertexIndex = r * (cols + 1) + c;
        const idx = vertexIndex * 2;

        const u = current[idx];
        const v = current[idx + 1];

        const du = (u - normX) * aspect;
        const dv = v - normY;
        const dist2 = du * du + dv * dv;

        if (dist2 < r2) {
          const dist     = Math.sqrt(dist2);
          const normDist = dist / normRadius;

          // Smooth cosine-like polynomial falloff feathering
          const falloff = (1.0 - normDist * normDist) * (1.0 - normDist * normDist);
          const factor  = falloff * strength;

          if (mode === 'freeze') {
            masks[vertexIndex] = Math.min(1.0, masks[vertexIndex] + factor * 1.5);
            isMaskModified = true;
          } else if (mode === 'thaw') {
            masks[vertexIndex] = Math.max(0.0, masks[vertexIndex] - factor * 1.5);
            isMaskModified = true;
          } else {
            const maskWeight = masks[vertexIndex];
            if (maskWeight >= 0.999) continue;
            const effectiveFactor = factor * (1.0 - maskWeight);

            if (mode === 'push') {
              // Shifts target pixels in stroke direction
              current[idx]     -= normDragX * effectiveFactor;
              current[idx + 1] -= normDragY * effectiveFactor;
              isUVModified = true;
            } else if (mode === 'swell') {
              // Bloat / Expand outward (for biceps, muscles, curves)
              if (dist > 0.00001) {
                const invDist = 1.0 / dist;
                const dirU = (du / aspect) * invDist;
                const dirV = dv * invDist;
                current[idx]     -= dirU * normRadius * effectiveFactor * 0.35;
                current[idx + 1] -= dirV * normRadius * effectiveFactor * 0.35;
                isUVModified = true;
              }
            } else if (mode === 'pinch') {
              // Shrink / Slim inward (for waists, contours)
              if (dist > 0.00001) {
                const invDist = 1.0 / dist;
                const dirU = (du / aspect) * invDist;
                const dirV = dv * invDist;
                current[idx]     += dirU * normRadius * effectiveFactor * 0.35;
                current[idx + 1] += dirV * normRadius * effectiveFactor * 0.35;
                isUVModified = true;
              }
            } else if (mode === 'reconstruct') {
              // Restore back to original base coordinates
              const curU = current[idx];
              const curV = current[idx + 1];
              current[idx]     += (base[idx]     - curU) * effectiveFactor * 0.5;
              current[idx + 1] += (base[idx + 1] - curV) * effectiveFactor * 0.5;
              isUVModified = true;
            }
          }
        }
      }
    }

    if (isMaskModified) {
      this.updateMaskBuffer();
    }
    if (isUVModified) {
      this.updateUVBuffer();
    }
    this.render();
  }

  public setInteracting(_interacting: boolean) {
    // Direct synchronous mesh update
  }

  // ---------------------------------------------------------------------------
  // Settings & Options
  // ---------------------------------------------------------------------------

  public updateSettings(settings: BrushSettings) {
    const prevGrid = this.currentSettings.meshGridSize;
    this.currentSettings = { ...settings };

    // Rebuild mesh if resolution setting changed
    if (settings.meshGridSize && settings.meshGridSize !== prevGrid && this.originalImage) {
      this.loadImage(this.originalImage, settings.meshGridSize);
      return;
    }

    this.render();
  }

  public setMeshOverlay(enabled: boolean, opacity = 0.5, color = '#10b981') {
    this.currentSettings.meshOverlay = enabled;
    this.currentSettings.meshOpacity = opacity;
    this.currentSettings.meshColor   = color;
    this.render();
  }

  public setMaskOverlay(enabled: boolean, opacity = 0.35, color = '#ef4444') {
    this.currentSettings.showMask    = enabled;
    this.currentSettings.maskOpacity = opacity;
    this.currentSettings.maskColor   = color;
    this.render();
  }

  public clearMask() {
    this.maskWeights.fill(0);
    this.updateMaskBuffer();
    this.saveHistoryState();
    this.render();
  }

  // ---------------------------------------------------------------------------
  // Hold-to-Compare
  // ---------------------------------------------------------------------------

  public setComparing(comparing: boolean) {
    if (this.isComparing !== comparing) {
      this.isComparing = comparing;
      this.render();
    }
  }

  // ---------------------------------------------------------------------------
  // History Stack (Undo / Redo / Reset)
  // ---------------------------------------------------------------------------

  public saveHistoryState() {
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    let texturePatch: TexturePatch | undefined = undefined;
    if (this.strokeDirtyBox && this.prevStrokeCtx && this.workingCtx) {
      const { x0, y0, x1, y1 } = this.strokeDirtyBox;
      const w = x1 - x0;
      const h = y1 - y0;
      if (w > 0 && h > 0) {
        const prevData = this.prevStrokeCtx.getImageData(x0, y0, w, h).data;
        const nextData = this.workingCtx.getImageData(x0, y0, w, h).data;
        texturePatch = {
          x: x0,
          y: y0,
          width: w,
          height: h,
          prevData: new Uint8ClampedArray(prevData),
          nextData: new Uint8ClampedArray(nextData)
        };
      }
      this.strokeDirtyBox = null;
    }

    this.history.push({
      uvs: new Float32Array(this.currentUVs),
      mask: new Float32Array(this.maskWeights),
      texturePatch
    });

    if (this.history.length > this.maxHistory) {
      this.history.shift();
    } else {
      this.historyIndex++;
    }
  }

  public canUndo(): boolean {
    return this.historyIndex > 0;
  }

  public canRedo(): boolean {
    return this.historyIndex < this.history.length - 1;
  }

  public undo(): boolean {
    if (!this.canUndo()) return false;
    const leavingState = this.history[this.historyIndex];
    if (leavingState?.texturePatch && this.workingCtx && this.gl && this.imageTexture) {
      const p = leavingState.texturePatch;
      const imgData = new ImageData(new Uint8ClampedArray(p.prevData), p.width, p.height);
      this.workingCtx.putImageData(imgData, p.x, p.y);
      this.gl.activeTexture(this.gl.TEXTURE0);
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.imageTexture);
      const rawBytes = new Uint8Array(p.prevData.buffer, p.prevData.byteOffset, p.prevData.byteLength);
      this.gl.texSubImage2D(this.gl.TEXTURE_2D, 0, p.x, p.y, p.width, p.height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, rawBytes);
    }

    this.historyIndex--;
    const state = this.history[this.historyIndex];
    this.currentUVs.set(state.uvs);
    this.maskWeights.set(state.mask);
    this.updateUVBuffer();
    this.updateMaskBuffer();
    this.render();
    return true;
  }

  public redo(): boolean {
    if (!this.canRedo()) return false;
    this.historyIndex++;
    const state = this.history[this.historyIndex];
    if (state.texturePatch && this.workingCtx && this.gl && this.imageTexture) {
      const p = state.texturePatch;
      const imgData = new ImageData(new Uint8ClampedArray(p.nextData), p.width, p.height);
      this.workingCtx.putImageData(imgData, p.x, p.y);
      this.gl.activeTexture(this.gl.TEXTURE0);
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.imageTexture);
      const rawBytes = new Uint8Array(p.nextData.buffer, p.nextData.byteOffset, p.nextData.byteLength);
      this.gl.texSubImage2D(this.gl.TEXTURE_2D, 0, p.x, p.y, p.width, p.height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, rawBytes);
    }

    this.currentUVs.set(state.uvs);
    this.maskWeights.set(state.mask);
    this.updateUVBuffer();
    this.updateMaskBuffer();
    this.render();
    return true;
  }

  public reset() {
    this.currentUVs.set(this.baseUVs);
    this.maskWeights.fill(0);
    this.updateUVBuffer();
    this.updateMaskBuffer();

    if (this.originalCanvas && this.workingCtx && this.gl && this.imageTexture) {
      this.strokeDirtyBox = { x0: 0, y0: 0, x1: this.imageWidth, y1: this.imageHeight };
      this.workingCtx.clearRect(0, 0, this.imageWidth, this.imageHeight);
      this.workingCtx.drawImage(this.originalCanvas, 0, 0);
      this.gl.activeTexture(this.gl.TEXTURE0);
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.imageTexture);
      this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, this.workingCanvas!);
    }

    this.saveHistoryState();
    this.render();
  }

  // ---------------------------------------------------------------------------
  // Render Pass
  // ---------------------------------------------------------------------------

  public render() {
    const gl = this.gl;
    if (!gl || !this.imageProgram || !this.imageTexture) return;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.02, 0.04, 0.02, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // === 1. Render Base Image Mesh ===
    gl.useProgram(this.imageProgram);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.enableVertexAttribArray(this.aPositionLoc);
    gl.vertexAttribPointer(this.aPositionLoc, 2, gl.FLOAT, false, 0, 0);

    const uvBuffer = this.isComparing ? this.compareBuffer : this.texCoordBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.enableVertexAttribArray(this.aTexCoordLoc);
    gl.vertexAttribPointer(this.aTexCoordLoc, 2, gl.FLOAT, false, 0, 0);

    if (this.aBaseUVLoc !== -1) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.baseUVBuffer);
      gl.enableVertexAttribArray(this.aBaseUVLoc);
      gl.vertexAttribPointer(this.aBaseUVLoc, 2, gl.FLOAT, false, 0, 0);
    }

    const activeTexture = (this.isComparing && this.originalTexture) ? this.originalTexture : this.imageTexture;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, activeTexture);
    gl.uniform1i(this.uImageLoc, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.subjectMaskTexture);
    gl.uniform1i(this.uSubjectMaskLoc, 1);

    const useGuard = this.currentSettings.backgroundGuard && this.hasSubjectMask && !this.isComparing;
    gl.uniform1f(this.uBackgroundGuardLoc, useGuard ? 1.0 : 0.0);
    gl.uniform1f(this.uShowSubjectMaskPreviewLoc, (this.currentSettings.showSubjectMaskPreview && !this.isComparing) ? 1.0 : 0.0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.drawElements(gl.TRIANGLES, this.numIndices, gl.UNSIGNED_INT, 0);

    if (this.aBaseUVLoc !== -1) {
      gl.disableVertexAttribArray(this.aBaseUVLoc);
    }

    // === 2. Wireframe Overlay (if enabled) ===
    if (this.currentSettings.meshOverlay && this.wireframeProgram && !this.isComparing) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(this.wireframeProgram);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.enableVertexAttribArray(this.aWireframePosLoc);
      gl.vertexAttribPointer(this.aWireframePosLoc, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
      gl.enableVertexAttribArray(this.aWireframeTexCoordLoc);
      gl.vertexAttribPointer(this.aWireframeTexCoordLoc, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.baseUVBuffer);
      gl.enableVertexAttribArray(this.aWireframeBaseUVLoc);
      gl.vertexAttribPointer(this.aWireframeBaseUVLoc, 2, gl.FLOAT, false, 0, 0);

      const color = this.parseHexColor(this.currentSettings.meshColor || '#10b981');
      gl.uniform4f(this.uWireframeColorLoc, color[0], color[1], color[2], this.currentSettings.meshOpacity);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.wireframeIndexBuffer);
      gl.drawElements(gl.LINES, this.numWireframeIndices, gl.UNSIGNED_INT, 0);

      gl.disableVertexAttribArray(this.aWireframePosLoc);
      gl.disableVertexAttribArray(this.aWireframeTexCoordLoc);
      gl.disableVertexAttribArray(this.aWireframeBaseUVLoc);
      gl.disable(gl.BLEND);
    }

    // === 3. Freeze Mask Overlay (if enabled) ===
    if (this.currentSettings.showMask && this.maskProgram && !this.isComparing) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(this.maskProgram);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.enableVertexAttribArray(this.aMaskPosLoc);
      gl.vertexAttribPointer(this.aMaskPosLoc, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
      gl.enableVertexAttribArray(this.aMaskTexCoordLoc);
      gl.vertexAttribPointer(this.aMaskTexCoordLoc, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.baseUVBuffer);
      gl.enableVertexAttribArray(this.aMaskBaseUVLoc);
      gl.vertexAttribPointer(this.aMaskBaseUVLoc, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.maskBuffer);
      gl.enableVertexAttribArray(this.aMaskWeightLoc);
      gl.vertexAttribPointer(this.aMaskWeightLoc, 1, gl.FLOAT, false, 0, 0);

      const color = this.parseHexColor(this.currentSettings.maskColor || '#ef4444');
      gl.uniform4f(this.uMaskColorLoc, color[0], color[1], color[2], this.currentSettings.maskOpacity);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
      gl.drawElements(gl.TRIANGLES, this.numIndices, gl.UNSIGNED_INT, 0);

      gl.disableVertexAttribArray(this.aMaskPosLoc);
      gl.disableVertexAttribArray(this.aMaskTexCoordLoc);
      gl.disableVertexAttribArray(this.aMaskBaseUVLoc);
      gl.disableVertexAttribArray(this.aMaskWeightLoc);
      gl.disable(gl.BLEND);
    }
  }

  private parseHexColor(hex: string): [number, number, number] {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16) / 255 || 0;
    const g = parseInt(clean.substring(2, 4), 16) / 255 || 0;
    const b = parseInt(clean.substring(4, 6), 16) / 255 || 0;
    return [r, g, b];
  }

  // ---------------------------------------------------------------------------
  // High-Resolution Export
  // ---------------------------------------------------------------------------

  public exportHighRes(settings: ExportSettings): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const sourceImage = this.workingCanvas || this.originalImage;
      if (!sourceImage) {
        reject(new Error('No image loaded'));
        return;
      }

      const exportCanvas = document.createElement('canvas');
      exportCanvas.width  = this.imageWidth;
      exportCanvas.height = this.imageHeight;

      const exportEngine = new LiquifyEngine(exportCanvas);
      exportEngine.loadImage(sourceImage, this.cols);

      // Copy deformed UVs
      exportEngine.currentUVs.set(this.currentUVs);
      exportEngine.updateUVBuffer();

      // Pass Subject Mask & Background Guard if enabled
      if (this.hasSubjectMask && this.subjectMaskCanvas) {
        exportEngine.setSubjectMask(this.subjectMaskCanvas);
      }
      exportEngine.setBackgroundGuard(this.currentSettings.backgroundGuard);

      exportEngine.render();

      exportCanvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create export blob'));
          exportEngine.destroy();
        },
        settings.format,
        settings.quality
      );
    });
  }

  public getImageDimensions() {
    return { width: this.imageWidth, height: this.imageHeight };
  }

  public destroy() {
    const gl = this.gl;
    if (!gl) return;

    this.deleteBuffer('vertexBuffer');
    this.deleteBuffer('baseUVBuffer');
    this.deleteBuffer('texCoordBuffer');
    this.deleteBuffer('compareBuffer');
    this.deleteBuffer('maskBuffer');
    this.deleteBuffer('indexBuffer');
    this.deleteBuffer('wireframeIndexBuffer');

    if (this.imageTexture) gl.deleteTexture(this.imageTexture);
    if (this.originalTexture) gl.deleteTexture(this.originalTexture);
    if (this.subjectMaskTexture) gl.deleteTexture(this.subjectMaskTexture);
    if (this.imageProgram) gl.deleteProgram(this.imageProgram);
    if (this.wireframeProgram) gl.deleteProgram(this.wireframeProgram);
    if (this.maskProgram) gl.deleteProgram(this.maskProgram);

    this.workingCanvas = null;
    this.workingCtx = null;
    this.originalCanvas = null;
    this.originalCtx = null;
    this.prevStrokeCanvas = null;
    this.prevStrokeCtx = null;
  }
}

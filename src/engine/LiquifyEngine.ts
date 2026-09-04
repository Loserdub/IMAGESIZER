import { ToolMode, BrushSettings, ExportSettings } from '../types/liquify';

export interface HistorySnapshot {
  uvs: Float32Array;
  mask: Float32Array;
}

export class LiquifyEngine {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  public isWebGL2 = false;

  // Source Image
  private originalImage: HTMLImageElement | ImageBitmap | null = null;
  private imageWidth = 0;
  private imageHeight = 0;
  private imageTexture: WebGLTexture | null = null;

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

  public loadImage(image: HTMLImageElement | ImageBitmap, gridSize?: number) {
    const gl = this.gl;
    if (!gl) return;

    this.originalImage = image;
    this.imageWidth    = image.width;
    this.imageHeight   = image.height;

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
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    this.subjectMaskCanvas = null;
    this.hasSubjectMask = false;
    this.currentSettings.hasSubjectMask = false;
    this.initDefaultSubjectMask();

    this.buildMesh();

    this.history = [];
    this.historyIndex = -1;
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

  public getImage(): HTMLImageElement | ImageBitmap | null {
    return this.originalImage;
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

    const cols = this.cols;
    const rows = this.rows;
    const current  = this.currentUVs;
    const base     = this.baseUVs;
    const masks    = this.maskWeights;
    const r2       = normRadius * normRadius;
    if (r2 <= 0) return;

    const aspect = this.imageWidth / this.imageHeight;
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

    this.history.push({
      uvs: new Float32Array(this.currentUVs),
      mask: new Float32Array(this.maskWeights)
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

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
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
      if (!this.originalImage) {
        reject(new Error('No image loaded'));
        return;
      }

      const exportCanvas = document.createElement('canvas');
      exportCanvas.width  = this.imageWidth;
      exportCanvas.height = this.imageHeight;

      const exportEngine = new LiquifyEngine(exportCanvas);
      exportEngine.loadImage(this.originalImage, this.cols);

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
    if (this.subjectMaskTexture) gl.deleteTexture(this.subjectMaskTexture);
    if (this.imageProgram) gl.deleteProgram(this.imageProgram);
    if (this.wireframeProgram) gl.deleteProgram(this.wireframeProgram);
    if (this.maskProgram) gl.deleteProgram(this.maskProgram);
  }
}

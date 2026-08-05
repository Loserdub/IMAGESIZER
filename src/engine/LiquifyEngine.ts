import { ToolMode, ExportSettings } from '../types/liquify';

export interface HistoryState {
  uvs: Float32Array;
  mask: Float32Array;
}

export class LiquifyEngine {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  private isWebGL2 = false;

  // Image properties
  private originalImage: HTMLImageElement | ImageBitmap | null = null;
  private imageWidth = 0;
  private imageHeight = 0;

  // Texture
  private imageTexture: WebGLTexture | null = null;

  // Grid dimensions
  private cols = 120;
  private rows = 120;
  private numVertices = 0;

  // CPU-side arrays
  private positions: Float32Array = new Float32Array(0);   // Clip-space [-1, 1]
  private baseUVs: Float32Array = new Float32Array(0);     // Normalized [0, 1]
  private currentUVs: Float32Array = new Float32Array(0);  // Deformed texture coords
  private maskWeights: Float32Array = new Float32Array(0); // Freeze mask protection [0.0 = free, 1.0 = locked]

  // GPU Buffers
  private vertexBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
  private baseUVBuffer: WebGLBuffer | null = null;
  private compareBuffer: WebGLBuffer | null = null;
  private maskBuffer: WebGLBuffer | null = null;
  private indexBuffer: WebGLBuffer | null = null;
  private wireframeIndexBuffer: WebGLBuffer | null = null;

  private numIndices = 0;
  private numWireframeIndices = 0;

  // Shaders
  private imageProgram: WebGLProgram | null = null;
  private wireframeProgram: WebGLProgram | null = null;
  private maskProgram: WebGLProgram | null = null;

  // Shader attribute/uniform locations — Image program
  private aPositionLoc = -1;
  private aTexCoordLoc = -1;
  private uImageLoc: WebGLUniformLocation | null = null;

  // Shader attribute/uniform locations — Wireframe program
  private aWireframePosLoc = -1;
  private aWireframeTexCoordLoc = -1;
  private aWireframeBaseUVLoc = -1;
  private uWireframeColorLoc: WebGLUniformLocation | null = null;

  // Shader attribute/uniform locations — Mask program
  private aMaskPosLoc = -1;
  private aMaskTexCoordLoc = -1;
  private aMaskBaseUVLoc = -1;
  private aMaskWeightLoc = -1;
  private uMaskColorLoc: WebGLUniformLocation | null = null;

  // State
  private isComparing = false;
  private showMeshOverlay = false;
  private meshOpacity = 0.5;
  private meshColor = '#3b82f6';

  private showMaskOverlay = true;
  private maskOpacity = 0.35;
  private maskColor = '#ef4444';

  // History stack — stores lightweight Float32Array copies of currentUVs and maskWeights
  private history: HistoryState[] = [];
  private historyIndex = -1;
  private maxHistory = 40;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.initGL();
  }

  // ---------------------------------------------------------------------------
  // WebGL Initialization
  // ---------------------------------------------------------------------------

  private initGL() {
    const gl2 = this.canvas.getContext('webgl2', { preserveDrawingBuffer: true, alpha: false });
    if (gl2) {
      this.gl = gl2;
      this.isWebGL2 = true;
    } else {
      const gl1 = this.canvas.getContext('webgl', { preserveDrawingBuffer: true, alpha: false }) as WebGLRenderingContext | null;
      if (!gl1) {
        console.error('[LiquifyEngine] WebGL not supported in this browser.');
        return;
      }
      gl1.getExtension('OES_element_index_uint');
      this.gl = gl1;
      this.isWebGL2 = false;
    }

    const gl = this.gl;

    // --- Image rendering shader ---
    const vsImage = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    const fsImage = `
      precision mediump float;
      uniform sampler2D u_image;
      varying vec2 v_texCoord;
      void main() {
        vec2 uv = clamp(v_texCoord, 0.0, 1.0);
        gl_FragColor = texture2D(u_image, uv);
      }
    `;

    this.imageProgram = this.createProgram(vsImage, fsImage);
    if (this.imageProgram) {
      this.aPositionLoc = gl.getAttribLocation(this.imageProgram, 'a_position');
      this.aTexCoordLoc = gl.getAttribLocation(this.imageProgram, 'a_texCoord');
      this.uImageLoc    = gl.getUniformLocation(this.imageProgram, 'u_image');
    }

    // --- Wireframe overlay shader ---
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

    // --- Freeze Mask overlay shader ---
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
  }

  private createProgram(vsCode: string, fsCode: string): WebGLProgram | null {
    const gl = this.gl;
    if (!gl) return null;

    const vs = gl.createShader(gl.VERTEX_SHADER);
    if (!vs) return null;
    gl.shaderSource(vs, vsCode);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      console.error('[LiquifyEngine] Vertex shader error:', gl.getShaderInfoLog(vs));
      gl.deleteShader(vs);
      return null;
    }

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    if (!fs) return null;
    gl.shaderSource(fs, fsCode);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error('[LiquifyEngine] Fragment shader error:', gl.getShaderInfoLog(fs));
      gl.deleteShader(fs);
      return null;
    }

    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[LiquifyEngine] Program link error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    return program;
  }

  // ---------------------------------------------------------------------------
  // Image Loading
  // ---------------------------------------------------------------------------

  public loadImage(image: HTMLImageElement | ImageBitmap, gridSize = 120) {
    const gl = this.gl;
    if (!gl) return;

    this.originalImage = image;
    this.imageWidth    = image.width;
    this.imageHeight   = image.height;
    this.cols          = gridSize;
    this.rows          = Math.round(gridSize * (image.height / image.width));

    if (this.imageTexture) gl.deleteTexture(this.imageTexture);
    this.imageTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    this.buildMesh();

    this.history = [];
    this.historyIndex = -1;
    this.saveHistoryState();

    this.render();
  }

  public setGridSize(gridSize: number) {
    if (!this.originalImage) return;
    this.loadImage(this.originalImage, gridSize);
  }

  // ---------------------------------------------------------------------------
  // Mesh Construction
  // ---------------------------------------------------------------------------

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
      const yPos = 1.0 - 2.0 * v;
      for (let c = 0; c <= cols; c++) {
        const u = c / cols;
        const xPos = 2.0 * u - 1.0;

        this.positions[idx]     = xPos;
        this.positions[idx + 1] = yPos;

        this.baseUVs[idx]     = u;
        this.baseUVs[idx + 1] = v;

        this.currentUVs[idx]     = u;
        this.currentUVs[idx + 1] = v;

        idx += 2;
      }
    }

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

  // ---------------------------------------------------------------------------
  // UV & Mask Buffer Sync
  // ---------------------------------------------------------------------------

  private updateUVBuffer() {
    const gl = this.gl;
    if (!gl || !this.texCoordBuffer) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.currentUVs);
  }

  private updateMaskBuffer() {
    const gl = this.gl;
    if (!gl || !this.maskBuffer) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.maskBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.maskWeights);
  }

  // ---------------------------------------------------------------------------
  // Warp & Mask Application
  // ---------------------------------------------------------------------------

  public applyWarp(
    normX: number,
    normY: number,
    normDragX: number,
    normDragY: number,
    normRadius: number,
    strength: number,
    mode: ToolMode
  ) {
    if (!this.originalImage || mode === 'pan') return;

    const numVerts = this.numVertices;
    const current  = this.currentUVs;
    const base     = this.baseUVs;
    const masks    = this.maskWeights;
    const r2       = normRadius * normRadius;
    if (r2 <= 0) return;

    const aspect = this.imageWidth / this.imageHeight;
    let isMaskModified = false;

    for (let i = 0; i < numVerts; i++) {
      const idx = i * 2;
      const u = current[idx];
      const v = current[idx + 1];

      const du = (u - normX) * aspect;
      const dv = v - normY;
      const dist2 = du * du + dv * dv;

      if (dist2 < r2) {
        const dist     = Math.sqrt(dist2);
        const normDist = dist / normRadius;

        const falloff = (1.0 - normDist * normDist) * (1.0 - normDist * normDist);
        const factor  = falloff * strength;

        if (mode === 'freeze') {
          // Freeze Mask: add protection weight
          masks[i] = Math.min(1.0, masks[i] + factor * 1.5);
          isMaskModified = true;
        } else if (mode === 'thaw') {
          // Thaw Mask: erase protection weight
          masks[i] = Math.max(0.0, masks[i] - factor * 1.5);
          isMaskModified = true;
        } else {
          // Warp modes: respect protection mask weight (1.0 = completely locked)
          const maskWeight = masks[i];
          if (maskWeight >= 0.999) continue;
          const effectiveFactor = factor * (1.0 - maskWeight);

          if (mode === 'push') {
            current[idx]     -= normDragX * effectiveFactor;
            current[idx + 1] -= normDragY * effectiveFactor;
          } else if (mode === 'swell') {
            if (dist > 0.00001) {
              const invDist = 1.0 / dist;
              const dirU = (du / aspect) * invDist;
              const dirV = dv * invDist;
              current[idx]     -= dirU * normRadius * effectiveFactor * 0.25;
              current[idx + 1] -= dirV * normRadius * effectiveFactor * 0.25;
            }
          } else if (mode === 'pinch') {
            if (dist > 0.00001) {
              const invDist = 1.0 / dist;
              const dirU = (du / aspect) * invDist;
              const dirV = dv * invDist;
              current[idx]     += dirU * normRadius * effectiveFactor * 0.25;
              current[idx + 1] += dirV * normRadius * effectiveFactor * 0.25;
            }
          } else if (mode === 'reconstruct') {
            const curU = current[idx];
            const curV = current[idx + 1];
            current[idx]     += (base[idx]     - curU) * effectiveFactor * 0.5;
            current[idx + 1] += (base[idx + 1] - curV) * effectiveFactor * 0.5;
          }
        }
      }
    }

    if (isMaskModified) {
      this.updateMaskBuffer();
    } else {
      this.updateUVBuffer();
    }
    this.render();
  }

  // ---------------------------------------------------------------------------
  // Freeze Mask Management
  // ---------------------------------------------------------------------------

  public clearMask() {
    this.maskWeights.fill(0);
    this.updateMaskBuffer();
    this.saveHistoryState();
    this.render();
  }

  public hasMask(): boolean {
    for (let i = 0; i < this.maskWeights.length; i++) {
      if (this.maskWeights[i] > 0.001) return true;
    }
    return false;
  }

  public setMaskOverlay(enabled: boolean, opacity = 0.35, color = '#ef4444') {
    this.showMaskOverlay = enabled;
    this.maskOpacity     = opacity;
    this.maskColor       = color;
    this.render();
  }

  // ---------------------------------------------------------------------------
  // History Stack
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

  public undo(): boolean {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      const state = this.history[this.historyIndex];
      this.currentUVs.set(state.uvs);
      this.maskWeights.set(state.mask);
      this.updateUVBuffer();
      this.updateMaskBuffer();
      this.render();
      return true;
    }
    return false;
  }

  public redo(): boolean {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      const state = this.history[this.historyIndex];
      this.currentUVs.set(state.uvs);
      this.maskWeights.set(state.mask);
      this.updateUVBuffer();
      this.updateMaskBuffer();
      this.render();
      return true;
    }
    return false;
  }

  public canUndo(): boolean { return this.historyIndex > 0; }
  public canRedo(): boolean { return this.historyIndex < this.history.length - 1; }

  public resetToOriginal() {
    this.currentUVs.set(this.baseUVs);
    this.maskWeights.fill(0);
    this.updateUVBuffer();
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
  // Mesh Overlay
  // ---------------------------------------------------------------------------

  public setMeshOverlay(enabled: boolean, opacity = 0.5, color = '#3b82f6') {
    this.showMeshOverlay = enabled;
    this.meshOpacity     = opacity;
    this.meshColor       = color;
    this.render();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  public render() {
    const gl = this.gl;
    if (!gl || !this.imageProgram || !this.imageTexture) return;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.02, 0.04, 0.02, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // === 1. Draw image ===
    gl.useProgram(this.imageProgram);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.enableVertexAttribArray(this.aPositionLoc);
    gl.vertexAttribPointer(this.aPositionLoc, 2, gl.FLOAT, false, 0, 0);

    const uvBuffer = this.isComparing ? this.compareBuffer : this.texCoordBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.enableVertexAttribArray(this.aTexCoordLoc);
    gl.vertexAttribPointer(this.aTexCoordLoc, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    gl.uniform1i(this.uImageLoc, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.drawElements(gl.TRIANGLES, this.numIndices, gl.UNSIGNED_INT, 0);

    // === 2. Draw wireframe overlay (if enabled) ===
    if (this.showMeshOverlay && this.wireframeProgram && !this.isComparing) {
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

      const hex = this.meshColor.replace('#', '');
      const r   = parseInt(hex.substring(0, 2), 16) / 255;
      const g   = parseInt(hex.substring(2, 4), 16) / 255;
      const b   = parseInt(hex.substring(4, 6), 16) / 255;
      gl.uniform4f(this.uWireframeColorLoc, r, g, b, this.meshOpacity);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.wireframeIndexBuffer);
      gl.drawElements(gl.LINES, this.numWireframeIndices, gl.UNSIGNED_INT, 0);

      gl.disableVertexAttribArray(this.aWireframePosLoc);
      gl.disableVertexAttribArray(this.aWireframeTexCoordLoc);
      gl.disableVertexAttribArray(this.aWireframeBaseUVLoc);

      gl.disable(gl.BLEND);
    }

    // === 3. Draw Freeze Mask overlay (if enabled) ===
    if (this.showMaskOverlay && this.maskProgram && !this.isComparing) {
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

      const hex = this.maskColor.replace('#', '');
      const r   = parseInt(hex.substring(0, 2), 16) / 255;
      const g   = parseInt(hex.substring(2, 4), 16) / 255;
      const b   = parseInt(hex.substring(4, 6), 16) / 255;
      gl.uniform4f(this.uMaskColorLoc, r, g, b, this.maskOpacity);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
      gl.drawElements(gl.TRIANGLES, this.numIndices, gl.UNSIGNED_INT, 0);

      gl.disableVertexAttribArray(this.aMaskPosLoc);
      gl.disableVertexAttribArray(this.aMaskTexCoordLoc);
      gl.disableVertexAttribArray(this.aMaskBaseUVLoc);
      gl.disableVertexAttribArray(this.aMaskWeightLoc);

      gl.disable(gl.BLEND);
    }
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

      exportEngine.currentUVs.set(this.currentUVs);
      exportEngine.updateUVBuffer();
      exportEngine.render();

      exportCanvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create export blob'));
        },
        settings.format,
        settings.quality
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  public getImageDimensions() {
    return { width: this.imageWidth, height: this.imageHeight };
  }
}

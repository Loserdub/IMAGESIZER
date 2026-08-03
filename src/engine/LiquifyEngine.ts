import { ToolMode, ExportSettings } from '../types/liquify';

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
  private positions: Float32Array = new Float32Array(0);  // Clip-space [-1, 1]
  private baseUVs: Float32Array = new Float32Array(0);    // Normalized [0, 1]
  private currentUVs: Float32Array = new Float32Array(0); // Deformed texture coords

  // GPU Buffers
  private vertexBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
  private baseUVBuffer: WebGLBuffer | null = null;  // FIX #5: dedicated baseUV buffer for wireframe
  private compareBuffer: WebGLBuffer | null = null; // FIX #4: persistent compare buffer, no per-frame alloc
  private indexBuffer: WebGLBuffer | null = null;
  private wireframeIndexBuffer: WebGLBuffer | null = null;

  private numIndices = 0;
  private numWireframeIndices = 0;

  // Shaders
  private imageProgram: WebGLProgram | null = null;
  private wireframeProgram: WebGLProgram | null = null;

  // Shader attribute/uniform locations — Image program
  private aPositionLoc = -1;
  private aTexCoordLoc = -1;
  private uImageLoc: WebGLUniformLocation | null = null;

  // Shader attribute/uniform locations — Wireframe program
  private aWireframePosLoc = -1;
  private aWireframeTexCoordLoc = -1;
  private aWireframeBaseUVLoc = -1; // FIX #5: properly declared
  private uWireframeColorLoc: WebGLUniformLocation | null = null;

  // State
  private isComparing = false;
  private showMeshOverlay = false;
  private meshOpacity = 0.5;
  private meshColor = '#3b82f6';

  // History stack — stores lightweight Float32Array copies of currentUVs
  private history: Float32Array[] = [];
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
    // Prefer WebGL2, fall back to WebGL1 with UNSIGNED_INT extension
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
      // FIX #6: Enable UNSIGNED_INT indices for WebGL1 so drawElements doesn't silently fail
      const ext = gl1.getExtension('OES_element_index_uint');
      if (!ext) {
        console.warn('[LiquifyEngine] OES_element_index_uint not available — falling back to UNSIGNED_SHORT indices.');
      }
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
      this.aPositionLoc  = gl.getAttribLocation(this.imageProgram, 'a_position');
      this.aTexCoordLoc  = gl.getAttribLocation(this.imageProgram, 'a_texCoord');
      this.uImageLoc     = gl.getUniformLocation(this.imageProgram, 'u_image');
    }

    // --- Wireframe overlay shader ---
    // FIX #5: Correctly uses a_baseUV to reconstruct vertex displacement in clip space.
    // The deformation delta (currentUV - baseUV) is mapped back to clip-space offset.
    // We do NOT displace gl_Position by 2x the UV difference directly — that was
    // wrong because the mesh vertex positions already live in clip space [-1,1] and
    // texture UVs live in [0,1]. The correct transform is:
    //   clipDelta.x =  (currentUV.x - baseUV.x) * 2.0
    //   clipDelta.y = -(currentUV.y - baseUV.y) * 2.0  (Y is flipped)
    const vsWireframe = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      attribute vec2 a_baseUV;
      void main() {
        vec2 uvDelta = a_texCoord - a_baseUV;
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
      this.aWireframeBaseUVLoc   = gl.getAttribLocation(this.wireframeProgram, 'a_baseUV'); // FIX #5
      this.uWireframeColorLoc    = gl.getUniformLocation(this.wireframeProgram, 'u_color');
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

    // Shaders can be freed from GPU after linking
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

    // Upload texture
    if (this.imageTexture) gl.deleteTexture(this.imageTexture);
    this.imageTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    this.buildMesh();

    // Clear history and record pristine state
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

    this.positions  = new Float32Array(this.numVertices * 2);
    this.baseUVs    = new Float32Array(this.numVertices * 2);
    this.currentUVs = new Float32Array(this.numVertices * 2);

    let idx = 0;
    for (let r = 0; r <= rows; r++) {
      const v = r / rows;
      const yPos = 1.0 - 2.0 * v; // WebGL NDC: +1 = top, -1 = bottom
      for (let c = 0; c <= cols; c++) {
        const u = c / cols;
        const xPos = 2.0 * u - 1.0; // WebGL NDC: -1 = left, +1 = right

        this.positions[idx]     = xPos;
        this.positions[idx + 1] = yPos;

        this.baseUVs[idx]    = u;
        this.baseUVs[idx + 1] = v;

        this.currentUVs[idx]     = u;
        this.currentUVs[idx + 1] = v;

        idx += 2;
      }
    }

    // Triangle indices
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

    // Wireframe indices (horizontal + vertical line segments)
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

    // Upload vertex position buffer (static — positions never change)
    this.deleteBuffer('vertexBuffer');
    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.positions, gl.STATIC_DRAW);

    // Upload baseUV buffer (static — base UVs never change)  FIX #5
    this.deleteBuffer('baseUVBuffer');
    this.baseUVBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.baseUVBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.baseUVs, gl.STATIC_DRAW);

    // Upload currentUV buffer (dynamic — updated every warp stroke)
    this.deleteBuffer('texCoordBuffer');
    this.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.currentUVs, gl.DYNAMIC_DRAW);

    // FIX #4: Allocate a persistent compare buffer (baseUVs copy) — uploaded once, reused forever
    this.deleteBuffer('compareBuffer');
    this.compareBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.compareBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.baseUVs, gl.STATIC_DRAW);

    // Triangle index buffer
    this.deleteBuffer('indexBuffer');
    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    // Wireframe index buffer
    this.deleteBuffer('wireframeIndexBuffer');
    this.wireframeIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.wireframeIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, wireIndices, gl.STATIC_DRAW);
  }

  /** Helper to delete a named buffer field safely */
  private deleteBuffer(field: 'vertexBuffer' | 'texCoordBuffer' | 'baseUVBuffer' | 'compareBuffer' | 'indexBuffer' | 'wireframeIndexBuffer') {
    const gl = this.gl;
    if (!gl) return;
    const buf = this[field];
    if (buf) {
      gl.deleteBuffer(buf);
      this[field] = null;
    }
  }

  // ---------------------------------------------------------------------------
  // UV Buffer Sync
  // ---------------------------------------------------------------------------

  private updateUVBuffer() {
    const gl = this.gl;
    if (!gl || !this.texCoordBuffer) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.currentUVs);
  }

  // ---------------------------------------------------------------------------
  // Warp Application
  // ---------------------------------------------------------------------------

  public applyWarp(
    normX: number,      // Brush center X in image-normalized [0, 1]
    normY: number,      // Brush center Y in image-normalized [0, 1]
    normDragX: number,  // Drag vector X in image-normalized coords
    normDragY: number,  // Drag vector Y in image-normalized coords
    normRadius: number, // Brush radius in image-normalized units
    strength: number,
    mode: ToolMode
  ) {
    if (!this.originalImage || mode === 'pan') return;

    const numVerts = this.numVertices;
    const current  = this.currentUVs;
    const base     = this.baseUVs;
    const r2       = normRadius * normRadius;
    if (r2 <= 0) return;

    // Aspect ratio correction: makes the brush perfectly circular on-screen
    const aspect = this.imageWidth / this.imageHeight;

    for (let i = 0; i < numVerts; i++) {
      const idx = i * 2;
      const u = current[idx];
      const v = current[idx + 1];

      // Distance from brush center (aspect-corrected so brush is circular)
      const du = (u - normX) * aspect;
      const dv = v - normY;
      const dist2 = du * du + dv * dv;

      if (dist2 < r2) {
        const dist     = Math.sqrt(dist2);
        const normDist = dist / normRadius;

        // Smooth hermite-like falloff: f(t) = (1 - t²)²
        const falloff = (1.0 - normDist * normDist) * (1.0 - normDist * normDist);
        const factor  = falloff * strength;

        if (mode === 'push') {
          // Move texture UVs opposite to drag direction (pixels follow brush)
          current[idx]     -= normDragX * factor;
          current[idx + 1] -= normDragY * factor;

        } else if (mode === 'swell') {
          // Bloat: pull texture UVs toward brush center (pixels expand outward)
          if (dist > 0.00001) {
            const invDist = 1.0 / dist;
            const dirU = (du / aspect) * invDist;
            const dirV = dv * invDist;
            current[idx]     -= dirU * normRadius * factor * 0.25;
            current[idx + 1] -= dirV * normRadius * factor * 0.25;
          }

        } else if (mode === 'pinch') {
          // Pinch: push texture UVs away from brush center (pixels contract)
          if (dist > 0.00001) {
            const invDist = 1.0 / dist;
            const dirU = (du / aspect) * invDist;
            const dirV = dv * invDist;
            current[idx]     += dirU * normRadius * factor * 0.25;
            current[idx + 1] += dirV * normRadius * factor * 0.25;
          }

        } else if (mode === 'reconstruct') {
          // FIX #7: Cache both current UV values before modifying either,
          // so the V delta is not computed from the already-modified U value.
          const curU = current[idx];
          const curV = current[idx + 1];
          current[idx]     += (base[idx]     - curU) * factor * 0.5;
          current[idx + 1] += (base[idx + 1] - curV) * factor * 0.5;
        }
      }
    }

    this.updateUVBuffer();
    this.render();
  }

  // ---------------------------------------------------------------------------
  // History Stack
  // ---------------------------------------------------------------------------

  public saveHistoryState() {
    // Prune redo branch when a new action is taken after undo
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    this.history.push(new Float32Array(this.currentUVs));
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    } else {
      this.historyIndex++;
    }
  }

  public undo(): boolean {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.currentUVs.set(this.history[this.historyIndex]);
      this.updateUVBuffer();
      this.render();
      return true;
    }
    return false;
  }

  public redo(): boolean {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.currentUVs.set(this.history[this.historyIndex]);
      this.updateUVBuffer();
      this.render();
      return true;
    }
    return false;
  }

  public canUndo(): boolean { return this.historyIndex > 0; }
  public canRedo(): boolean { return this.historyIndex < this.history.length - 1; }

  public resetToOriginal() {
    this.currentUVs.set(this.baseUVs);
    this.updateUVBuffer();
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
    gl.clearColor(0.05, 0.05, 0.07, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // === 1. Draw image ===
    gl.useProgram(this.imageProgram);

    // Position vertices
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.enableVertexAttribArray(this.aPositionLoc);
    gl.vertexAttribPointer(this.aPositionLoc, 2, gl.FLOAT, false, 0, 0);

    // FIX #4: Use pre-allocated compareBuffer (baseUVs) or the live texCoordBuffer.
    // No per-frame GPU allocation — zero memory leak.
    const uvBuffer = this.isComparing ? this.compareBuffer : this.texCoordBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.enableVertexAttribArray(this.aTexCoordLoc);
    gl.vertexAttribPointer(this.aTexCoordLoc, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    gl.uniform1i(this.uImageLoc, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    // FIX #6: UNSIGNED_INT is safe because OES_element_index_uint is enabled for WebGL1,
    // and WebGL2 supports it natively.
    gl.drawElements(gl.TRIANGLES, this.numIndices, gl.UNSIGNED_INT, 0);

    // === 2. Draw wireframe overlay (if enabled) ===
    if (this.showMeshOverlay && this.wireframeProgram && !this.isComparing) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(this.wireframeProgram);

      // a_position — vertex clip-space positions
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.enableVertexAttribArray(this.aWireframePosLoc);
      gl.vertexAttribPointer(this.aWireframePosLoc, 2, gl.FLOAT, false, 0, 0);

      // a_texCoord — current (deformed) UV coords
      gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
      gl.enableVertexAttribArray(this.aWireframeTexCoordLoc);
      gl.vertexAttribPointer(this.aWireframeTexCoordLoc, 2, gl.FLOAT, false, 0, 0);

      // FIX #5: a_baseUV — original (undeformed) UV coords, now actually bound
      gl.bindBuffer(gl.ARRAY_BUFFER, this.baseUVBuffer);
      gl.enableVertexAttribArray(this.aWireframeBaseUVLoc);
      gl.vertexAttribPointer(this.aWireframeBaseUVLoc, 2, gl.FLOAT, false, 0, 0);

      // Parse hex color string → vec4
      const hex = this.meshColor.replace('#', '');
      const r   = parseInt(hex.substring(0, 2), 16) / 255;
      const g   = parseInt(hex.substring(2, 4), 16) / 255;
      const b   = parseInt(hex.substring(4, 6), 16) / 255;
      gl.uniform4f(this.uWireframeColorLoc, r, g, b, this.meshOpacity);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.wireframeIndexBuffer);
      gl.drawElements(gl.LINES, this.numWireframeIndices, gl.UNSIGNED_INT, 0);

      // Clean up attrib state to avoid contaminating subsequent draws
      gl.disableVertexAttribArray(this.aWireframePosLoc);
      gl.disableVertexAttribArray(this.aWireframeTexCoordLoc);
      gl.disableVertexAttribArray(this.aWireframeBaseUVLoc);

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

      // Off-screen canvas at native image dimensions for lossless UV mapping
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width  = this.imageWidth;
      exportCanvas.height = this.imageHeight;

      const exportEngine = new LiquifyEngine(exportCanvas);
      exportEngine.loadImage(this.originalImage, this.cols);

      // Copy current UV deformation state to export engine
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

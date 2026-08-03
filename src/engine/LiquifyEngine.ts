import { ToolMode, ExportSettings } from '../types/liquify';

export class LiquifyEngine {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;

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

  // Buffers
  private positions: Float32Array = new Float32Array(0); // Normalized [-1, 1]
  private baseUVs: Float32Array = new Float32Array(0);   // Normalized [0, 1]
  private currentUVs: Float32Array = new Float32Array(0);// Deformed texture coords

  private vertexBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
  private indexBuffer: WebGLBuffer | null = null;
  private wireframeIndexBuffer: WebGLBuffer | null = null;

  private numIndices = 0;
  private numWireframeIndices = 0;

  // Shaders
  private imageProgram: WebGLProgram | null = null;
  private wireframeProgram: WebGLProgram | null = null;

  // Shader locations - Image
  private aPositionLoc = -1;
  private aTexCoordLoc = -1;
  private uImageLoc: WebGLUniformLocation | null = null;
  private uCompareLoc: WebGLUniformLocation | null = null;

  // Shader locations - Wireframe
  private aWireframePosLoc = -1;
  private aWireframeDispLoc = -1;
  private uWireframeColorLoc: WebGLUniformLocation | null = null;

  // State
  private isComparing = false;
  private showMeshOverlay = false;
  private meshOpacity = 0.5;
  private meshColor = '#3b82f6';

  // History stack
  private history: Float32Array[] = [];
  private historyIndex = -1;
  private maxHistory = 40;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.initGL();
  }

  private initGL() {
    const gl = this.canvas.getContext('webgl2', { preserveDrawingBuffer: true, alpha: true }) ||
               this.canvas.getContext('webgl', { preserveDrawingBuffer: true, alpha: true });
    
    if (!gl) {
      console.error('WebGL not supported');
      return;
    }
    this.gl = gl;

    // Image Shader
    const vsSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    const fsSource = `
      precision mediump float;
      uniform sampler2D u_image;
      varying vec2 v_texCoord;
      void main() {
        // Clamp to edge to prevent border wrapping artifacts
        vec2 clampedUV = clamp(v_texCoord, 0.0, 1.0);
        gl_FragColor = texture2D(u_image, clampedUV);
      }
    `;

    this.imageProgram = this.createProgram(vsSource, fsSource);
    if (this.imageProgram) {
      this.aPositionLoc = gl.getAttribLocation(this.imageProgram, 'a_position');
      this.aTexCoordLoc = gl.getAttribLocation(this.imageProgram, 'a_texCoord');
      this.uImageLoc = gl.getUniformLocation(this.imageProgram, 'u_image');
    }

    // Wireframe Shader
    const vsWireframe = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      attribute vec2 a_baseUV;
      varying vec2 v_uv;
      void main() {
        // Render mesh overlay mapped to deformed locations
        // Pos = basePos + (currUV - baseUV) * scale adjustment
        vec2 uvDiff = a_texCoord - a_baseUV;
        vec2 displacedPos = a_position + vec2(uvDiff.x * 2.0, -uvDiff.y * 2.0);
        gl_Position = vec4(displacedPos, -0.1, 1.0);
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
      this.aWireframePosLoc = gl.getAttribLocation(this.wireframeProgram, 'a_position');
      this.aWireframeDispLoc = gl.getAttribLocation(this.wireframeProgram, 'a_texCoord');
      this.uWireframeColorLoc = gl.getUniformLocation(this.wireframeProgram, 'u_color');
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
      console.error('VS Error:', gl.getShaderInfoLog(vs));
      return null;
    }

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    if (!fs) return null;
    gl.shaderSource(fs, fsCode);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error('FS Error:', gl.getShaderInfoLog(fs));
      return null;
    }

    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Link Error:', gl.getProgramInfoLog(program));
      return null;
    }

    return program;
  }

  public loadImage(image: HTMLImageElement | ImageBitmap, gridSize = 120) {
    const gl = this.gl;
    if (!gl) return;

    this.originalImage = image;
    this.imageWidth = image.width;
    this.imageHeight = image.height;
    this.cols = gridSize;
    this.rows = Math.round(gridSize * (image.height / image.width));

    // Upload texture
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

    // Build mesh buffers
    this.buildMesh();
    
    // Clear history and save initial state
    this.history = [];
    this.historyIndex = -1;
    this.saveHistoryState();

    this.render();
  }

  public setGridSize(gridSize: number) {
    if (!this.originalImage) return;
    this.loadImage(this.originalImage, gridSize);
  }

  private buildMesh() {
    const gl = this.gl;
    if (!gl) return;

    const cols = this.cols;
    const rows = this.rows;
    this.numVertices = (cols + 1) * (rows + 1);

    this.positions = new Float32Array(this.numVertices * 2);
    this.baseUVs = new Float32Array(this.numVertices * 2);
    this.currentUVs = new Float32Array(this.numVertices * 2);

    let idx = 0;
    for (let r = 0; r <= rows; r++) {
      const v = r / rows;
      const yPos = 1.0 - 2.0 * v; // WebGL Y goes from +1 top to -1 bottom
      for (let c = 0; c <= cols; c++) {
        const u = c / cols;
        const xPos = 2.0 * u - 1.0; // WebGL X goes from -1 left to +1 right

        this.positions[idx] = xPos;
        this.positions[idx + 1] = yPos;

        this.baseUVs[idx] = u;
        this.baseUVs[idx + 1] = v;

        this.currentUVs[idx] = u;
        this.currentUVs[idx + 1] = v;

        idx += 2;
      }
    }

    // Triangle Indices
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

        // Tri 1
        indices[iIdx++] = p0;
        indices[iIdx++] = p2;
        indices[iIdx++] = p1;

        // Tri 2
        indices[iIdx++] = p1;
        indices[iIdx++] = p2;
        indices[iIdx++] = p3;
      }
    }

    // Wireframe Indices (Horizontal & Vertical lines)
    const numHorizontalLines = (rows + 1) * cols;
    const numVerticalLines = (cols + 1) * rows;
    this.numWireframeIndices = (numHorizontalLines + numVerticalLines) * 2;
    const wireIndices = new Uint32Array(this.numWireframeIndices);
    let wIdx = 0;

    // Horizontal lines
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c < cols; c++) {
        const p0 = r * (cols + 1) + c;
        wireIndices[wIdx++] = p0;
        wireIndices[wIdx++] = p0 + 1;
      }
    }

    // Vertical lines
    for (let c = 0; c <= cols; c++) {
      for (let r = 0; r < rows; r++) {
        const p0 = r * (cols + 1) + c;
        const p1 = (r + 1) * (cols + 1) + c;
        wireIndices[wIdx++] = p0;
        wireIndices[wIdx++] = p1;
      }
    }

    // Create GL Buffers
    if (this.vertexBuffer) gl.deleteBuffer(this.vertexBuffer);
    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.positions, gl.STATIC_DRAW);

    if (this.texCoordBuffer) gl.deleteBuffer(this.texCoordBuffer);
    this.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.currentUVs, gl.DYNAMIC_DRAW);

    if (this.indexBuffer) gl.deleteBuffer(this.indexBuffer);
    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    if (this.wireframeIndexBuffer) gl.deleteBuffer(this.wireframeIndexBuffer);
    this.wireframeIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.wireframeIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, wireIndices, gl.STATIC_DRAW);
  }

  public applyWarp(
    normX: number, // Brush center X in normalized image coords [0, 1]
    normY: number, // Brush center Y in normalized image coords [0, 1]
    normDragX: number, // Vector drag X in normalized image coords
    normDragY: number, // Vector drag Y in normalized image coords
    normRadius: number, // Brush radius in normalized image coords
    strength: number,
    mode: ToolMode
  ) {
    if (!this.originalImage || mode === 'pan') return;

    const cols = this.cols;
    const rows = this.rows;
    const numVerts = this.numVertices;

    const current = this.currentUVs;
    const base = this.baseUVs;
    const r2 = normRadius * normRadius;
    if (r2 <= 0) return;

    // Aspect ratio correction for distance calculation so brush is perfectly circular
    const aspect = this.imageWidth / this.imageHeight;

    for (let i = 0; i < numVerts; i++) {
      const idx = i * 2;
      const u = current[idx];
      const v = current[idx + 1];

      // Distance from brush center in normalized space (aspect adjusted)
      const du = (u - normX) * aspect;
      const dv = v - normY;
      const dist2 = du * du + dv * dv;

      if (dist2 < r2) {
        const dist = Math.sqrt(dist2);
        const normDist = dist / normRadius;

        // Smooth cosine/cubic radial falloff
        const falloff = Math.pow(1.0 - normDist * normDist, 2);
        const factor = falloff * strength;

        if (mode === 'push') {
          // Push pixels in drag direction (subtract vector from texture UV coords)
          current[idx] -= normDragX * factor;
          current[idx + 1] -= normDragY * factor;
        } else if (mode === 'swell') {
          // Bloat/Expand: Move texture coords towards center
          if (dist > 0.00001) {
            const dirU = du / aspect / dist;
            const dirV = dv / dist;
            current[idx] -= dirU * normRadius * factor * 0.25;
            current[idx + 1] -= dirV * normRadius * factor * 0.25;
          }
        } else if (mode === 'pinch') {
          // Pinch/Shrink: Move texture coords away from center
          if (dist > 0.00001) {
            const dirU = du / aspect / dist;
            const dirV = dv / dist;
            current[idx] += dirU * normRadius * factor * 0.25;
            current[idx + 1] += dirV * normRadius * factor * 0.25;
          }
        } else if (mode === 'reconstruct') {
          // Restore back to original base UVs
          const baseU = base[idx];
          const baseV = base[idx + 1];
          current[idx] += (baseU - current[idx]) * factor * 0.5;
          current[idx + 1] += (baseV - current[idx + 1]) * factor * 0.5;
        }
      }
    }

    this.updateUVBuffer();
    this.render();
  }

  private updateUVBuffer() {
    const gl = this.gl;
    if (!gl || !this.texCoordBuffer) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.currentUVs);
  }

  // --- History Stack ---

  public saveHistoryState() {
    // If we undo and perform a new action, slice off redo branch
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

  public canUndo(): boolean {
    return this.historyIndex > 0;
  }

  public canRedo(): boolean {
    return this.historyIndex < this.history.length - 1;
  }

  public resetToOriginal() {
    this.currentUVs.set(this.baseUVs);
    this.updateUVBuffer();
    this.saveHistoryState();
    this.render();
  }

  // --- Hold-to-Compare ---

  public setComparing(comparing: boolean) {
    if (this.isComparing !== comparing) {
      this.isComparing = comparing;
      this.render();
    }
  }

  // --- Mesh Overlay ---

  public setMeshOverlay(enabled: boolean, opacity = 0.5, color = '#3b82f6') {
    this.showMeshOverlay = enabled;
    this.meshOpacity = opacity;
    this.meshColor = color;
    this.render();
  }

  // --- Render Cycle ---

  public render() {
    const gl = this.gl;
    if (!gl || !this.imageProgram || !this.imageTexture) return;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.05, 0.05, 0.07, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 1. Draw Image
    gl.useProgram(this.imageProgram);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.enableVertexAttribArray(this.aPositionLoc);
    gl.vertexAttribPointer(this.aPositionLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.enableVertexAttribArray(this.aTexCoordLoc);

    if (this.isComparing) {
      // Temporarily use baseUVs buffer during comparison
      const tempBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, tempBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.baseUVs, gl.STREAM_DRAW);
      gl.vertexAttribPointer(this.aTexCoordLoc, 2, gl.FLOAT, false, 0, 0);
    } else {
      gl.vertexAttribPointer(this.aTexCoordLoc, 2, gl.FLOAT, false, 0, 0);
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    gl.uniform1i(this.uImageLoc, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.drawElements(gl.TRIANGLES, this.numIndices, gl.UNSIGNED_INT, 0);

    // 2. Draw Mesh Overlay Wireframe (if enabled)
    if (this.showMeshOverlay && this.wireframeProgram && !this.isComparing) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(this.wireframeProgram);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.enableVertexAttribArray(this.aWireframePosLoc);
      gl.vertexAttribPointer(this.aWireframePosLoc, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
      gl.enableVertexAttribArray(this.aWireframeDispLoc);
      gl.vertexAttribPointer(this.aWireframeDispLoc, 2, gl.FLOAT, false, 0, 0);

      // Parse hex color
      const hex = this.meshColor.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;

      gl.uniform4f(this.uWireframeColorLoc, r, g, b, this.meshOpacity);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.wireframeIndexBuffer);
      gl.drawElements(gl.LINES, this.numWireframeIndices, gl.UNSIGNED_INT, 0);

      gl.disable(gl.BLEND);
    }
  }

  // --- High-Resolution Export ---

  public exportHighRes(settings: ExportSettings): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.originalImage) {
        reject(new Error('No image loaded'));
        return;
      }

      // Create offscreen canvas at native image dimensions
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = this.imageWidth;
      exportCanvas.height = this.imageHeight;

      const exportEngine = new LiquifyEngine(exportCanvas);
      exportEngine.loadImage(this.originalImage, this.cols);

      // Copy current UV mesh coordinates to export engine
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

  public getImageDimensions() {
    return { width: this.imageWidth, height: this.imageHeight };
  }
}

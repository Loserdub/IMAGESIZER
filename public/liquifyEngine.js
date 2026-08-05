/**
 * Standalone Production WebGL 2.0 / 1.0 Liquify & Image Distortion Engine
 * ImageSizer Engine Core
 * Author: Justin Ray (jray / loserdub) - TrustNodeLogic
 */

export class LiquifyEngine {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.isWebGL2 = false;

    // Image state
    this.originalImage = null;
    this.imageWidth = 0;
    this.imageHeight = 0;
    this.imageTexture = null;

    // Grid resolution
    this.cols = 120;
    this.rows = 120;
    this.numVertices = 0;

    // CPU-side arrays
    this.positions = new Float32Array(0);   // Clip-space [-1, 1]
    this.baseUVs = new Float32Array(0);     // Normalized base [0, 1]
    this.currentUVs = new Float32Array(0);  // Deformed texture coords
    this.maskWeights = new Float32Array(0); // Protection mask [0.0 = free, 1.0 = locked]

    // GPU Buffers
    this.vertexBuffer = null;
    this.texCoordBuffer = null;
    this.baseUVBuffer = null;
    this.compareBuffer = null;
    this.maskBuffer = null;
    this.indexBuffer = null;
    this.wireframeIndexBuffer = null;

    this.numIndices = 0;
    this.numWireframeIndices = 0;

    // Shader Programs
    this.imageProgram = null;
    this.wireframeProgram = null;
    this.maskProgram = null;

    // Attribute & Uniform locations
    this.aPositionLoc = -1;
    this.aTexCoordLoc = -1;
    this.uImageLoc = null;

    this.aWireframePosLoc = -1;
    this.aWireframeTexCoordLoc = -1;
    this.aWireframeBaseUVLoc = -1;
    this.uWireframeColorLoc = null;

    this.aMaskPosLoc = -1;
    this.aMaskTexCoordLoc = -1;
    this.aMaskBaseUVLoc = -1;
    this.aMaskWeightLoc = -1;
    this.uMaskColorLoc = null;

    // Overlay & Compare State
    this.isComparing = false;
    this.showMeshOverlay = false;
    this.meshOpacity = 0.5;
    this.meshColor = '#3b82f6';

    this.showMaskOverlay = true;
    this.maskOpacity = 0.35;
    this.maskColor = '#ef4444';

    // History stack
    this.history = [];
    this.historyIndex = -1;
    this.maxHistory = 40;

    this._initGL();
  }

  _initGL() {
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

    // --- Image Shader ---
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

    this.imageProgram = this._createProgram(vsImage, fsImage);
    if (this.imageProgram) {
      this.aPositionLoc = gl.getAttribLocation(this.imageProgram, 'a_position');
      this.aTexCoordLoc = gl.getAttribLocation(this.imageProgram, 'a_texCoord');
      this.uImageLoc = gl.getUniformLocation(this.imageProgram, 'u_image');
    }

    // --- Wireframe Shader ---
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

    this.wireframeProgram = this._createProgram(vsWireframe, fsWireframe);
    if (this.wireframeProgram) {
      this.aWireframePosLoc = gl.getAttribLocation(this.wireframeProgram, 'a_position');
      this.aWireframeTexCoordLoc = gl.getAttribLocation(this.wireframeProgram, 'a_texCoord');
      this.aWireframeBaseUVLoc = gl.getAttribLocation(this.wireframeProgram, 'a_baseUV');
      this.uWireframeColorLoc = gl.getUniformLocation(this.wireframeProgram, 'u_color');
    }

    // --- Mask Overlay Shader ---
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

    this.maskProgram = this._createProgram(vsMask, fsMask);
    if (this.maskProgram) {
      this.aMaskPosLoc = gl.getAttribLocation(this.maskProgram, 'a_position');
      this.aMaskTexCoordLoc = gl.getAttribLocation(this.maskProgram, 'a_texCoord');
      this.aMaskBaseUVLoc = gl.getAttribLocation(this.maskProgram, 'a_baseUV');
      this.aMaskWeightLoc = gl.getAttribLocation(this.maskProgram, 'a_maskWeight');
      this.uMaskColorLoc = gl.getUniformLocation(this.maskProgram, 'u_color');
    }
  }

  _createProgram(vsCode, fsCode) {
    const gl = this.gl;
    if (!gl) return null;

    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, vsCode);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      console.error('[LiquifyEngine] Vertex shader compilation failed:', gl.getShaderInfoLog(vs));
      gl.deleteShader(vs);
      return null;
    }

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fsCode);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error('[LiquifyEngine] Fragment shader compilation failed:', gl.getShaderInfoLog(fs));
      gl.deleteShader(fs);
      return null;
    }

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[LiquifyEngine] Shader program link failed:', gl.getProgramInfoLog(prog));
      gl.deleteProgram(prog);
      return null;
    }

    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return prog;
  }

  loadImage(image, gridSize = 120) {
    const gl = this.gl;
    if (!gl) return;

    this.originalImage = image;
    this.imageWidth = image.width;
    this.imageHeight = image.height;
    this.cols = gridSize;
    this.rows = Math.round(gridSize * (image.height / image.width));

    if (this.imageTexture) gl.deleteTexture(this.imageTexture);
    this.imageTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    this._buildMesh();
    this.history = [];
    this.historyIndex = -1;
    this.saveHistoryState();
    this.render();
  }

  setGridSize(gridSize) {
    if (!this.originalImage) return;
    this.loadImage(this.originalImage, gridSize);
  }

  _buildMesh() {
    const gl = this.gl;
    if (!gl) return;

    const cols = this.cols;
    const rows = this.rows;
    this.numVertices = (cols + 1) * (rows + 1);

    this.positions = new Float32Array(this.numVertices * 2);
    this.baseUVs = new Float32Array(this.numVertices * 2);
    this.currentUVs = new Float32Array(this.numVertices * 2);
    this.maskWeights = new Float32Array(this.numVertices);

    let idx = 0;
    for (let r = 0; r <= rows; r++) {
      const v = r / rows;
      const yPos = 1.0 - 2.0 * v;
      for (let c = 0; c <= cols; c++) {
        const u = c / cols;
        const xPos = 2.0 * u - 1.0;

        this.positions[idx] = xPos;
        this.positions[idx + 1] = yPos;
        this.baseUVs[idx] = u;
        this.baseUVs[idx + 1] = v;
        this.currentUVs[idx] = u;
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

    this._safeDeleteBuffer('vertexBuffer');
    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.positions, gl.STATIC_DRAW);

    this._safeDeleteBuffer('baseUVBuffer');
    this.baseUVBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.baseUVBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.baseUVs, gl.STATIC_DRAW);

    this._safeDeleteBuffer('texCoordBuffer');
    this.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.currentUVs, gl.DYNAMIC_DRAW);

    this._safeDeleteBuffer('compareBuffer');
    this.compareBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.compareBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.baseUVs, gl.STATIC_DRAW);

    this._safeDeleteBuffer('maskBuffer');
    this.maskBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.maskBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.maskWeights, gl.DYNAMIC_DRAW);

    this._safeDeleteBuffer('indexBuffer');
    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    this._safeDeleteBuffer('wireframeIndexBuffer');
    this.wireframeIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.wireframeIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, wireIndices, gl.STATIC_DRAW);
  }

  _safeDeleteBuffer(field) {
    if (this.gl && this[field]) {
      this.gl.deleteBuffer(this[field]);
      this[field] = null;
    }
  }

  _updateUVBuffer() {
    const gl = this.gl;
    if (!gl || !this.texCoordBuffer) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.currentUVs);
  }

  _updateMaskBuffer() {
    const gl = this.gl;
    if (!gl || !this.maskBuffer) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.maskBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.maskWeights);
  }

  clearMask() {
    this.maskWeights.fill(0);
    this._updateMaskBuffer();
    this.saveHistoryState();
    this.render();
  }

  setMaskOverlay(enabled, opacity = 0.35, color = '#ef4444') {
    this.showMaskOverlay = enabled;
    this.maskOpacity = opacity;
    this.maskColor = color;
    this.render();
  }

  applyWarp(normX, normY, normDragX, normDragY, normRadius, strength, mode) {
    if (!this.originalImage || mode === 'pan') return;

    const numVerts = this.numVertices;
    const current = this.currentUVs;
    const base = this.baseUVs;
    const masks = this.maskWeights;
    const r2 = normRadius * normRadius;
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
        const dist = Math.sqrt(dist2);
        const normDist = dist / normRadius;
        const falloff = (1.0 - normDist * normDist) * (1.0 - normDist * normDist);
        const factor = falloff * strength;

        if (mode === 'freeze') {
          masks[i] = Math.min(1.0, masks[i] + factor * 1.5);
          isMaskModified = true;
        } else if (mode === 'thaw') {
          masks[i] = Math.max(0.0, masks[i] - factor * 1.5);
          isMaskModified = true;
        } else {
          const maskWeight = masks[i];
          if (maskWeight >= 0.999) continue;
          const effectiveFactor = factor * (1.0 - maskWeight);

          if (mode === 'push') {
            current[idx] -= normDragX * effectiveFactor;
            current[idx + 1] -= normDragY * effectiveFactor;
          } else if (mode === 'swell') {
            if (dist > 0.00001) {
              const invDist = 1.0 / dist;
              const dirU = (du / aspect) * invDist;
              const dirV = dv * invDist;
              current[idx] -= dirU * normRadius * effectiveFactor * 0.25;
              current[idx + 1] -= dirV * normRadius * effectiveFactor * 0.25;
            }
          } else if (mode === 'pinch') {
            if (dist > 0.00001) {
              const invDist = 1.0 / dist;
              const dirU = (du / aspect) * invDist;
              const dirV = dv * invDist;
              current[idx] += dirU * normRadius * effectiveFactor * 0.25;
              current[idx + 1] += dirV * normRadius * effectiveFactor * 0.25;
            }
          } else if (mode === 'reconstruct') {
            const curU = current[idx];
            const curV = current[idx + 1];
            current[idx] += (base[idx] - curU) * effectiveFactor * 0.5;
            current[idx + 1] += (base[idx + 1] - curV) * effectiveFactor * 0.5;
          }
        }
      }
    }

    if (isMaskModified) {
      this._updateMaskBuffer();
    } else {
      this._updateUVBuffer();
    }
    this.render();
  }

  saveHistoryState() {
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

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      const state = this.history[this.historyIndex];
      this.currentUVs.set(state.uvs);
      this.maskWeights.set(state.mask);
      this._updateUVBuffer();
      this._updateMaskBuffer();
      this.render();
      return true;
    }
    return false;
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      const state = this.history[this.historyIndex];
      this.currentUVs.set(state.uvs);
      this.maskWeights.set(state.mask);
      this._updateUVBuffer();
      this._updateMaskBuffer();
      this.render();
      return true;
    }
    return false;
  }

  canUndo() { return this.historyIndex > 0; }
  canRedo() { return this.historyIndex < this.history.length - 1; }

  resetToOriginal() {
    this.currentUVs.set(this.baseUVs);
    this.maskWeights.fill(0);
    this._updateUVBuffer();
    this._updateMaskBuffer();
    this.saveHistoryState();
    this.render();
  }

  setComparing(comparing) {
    if (this.isComparing !== comparing) {
      this.isComparing = comparing;
      this.render();
    }
  }

  setMeshOverlay(enabled, opacity = 0.5, color = '#3b82f6') {
    this.showMeshOverlay = enabled;
    this.meshOpacity = opacity;
    this.meshColor = color;
    this.render();
  }

  render() {
    const gl = this.gl;
    if (!gl || !this.imageProgram || !this.imageTexture) return;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.02, 0.04, 0.02, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

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
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      gl.uniform4f(this.uWireframeColorLoc, r, g, b, this.meshOpacity);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.wireframeIndexBuffer);
      gl.drawElements(gl.LINES, this.numWireframeIndices, gl.UNSIGNED_INT, 0);

      gl.disableVertexAttribArray(this.aWireframePosLoc);
      gl.disableVertexAttribArray(this.aWireframeTexCoordLoc);
      gl.disableVertexAttribArray(this.aWireframeBaseUVLoc);
      gl.disable(gl.BLEND);
    }

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
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
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

  exportHighRes(settings) {
    return new Promise((resolve, reject) => {
      if (!this.originalImage) {
        reject(new Error('No image loaded'));
        return;
      }

      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = this.imageWidth;
      exportCanvas.height = this.imageHeight;

      const exportEngine = new LiquifyEngine(exportCanvas);
      exportEngine.loadImage(this.originalImage, this.cols);
      exportEngine.currentUVs.set(this.currentUVs);
      exportEngine._updateUVBuffer();
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
}

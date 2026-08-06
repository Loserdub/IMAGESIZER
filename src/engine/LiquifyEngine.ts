import { ToolMode, BrushSettings, ExportSettings } from '../types/liquify';

export interface HistoryState {
  uvs: Float32Array;
  mask: Float32Array;
}

// Shader sources
const baseVertexShader = `
  precision highp float;
  attribute vec2 aPosition;
  varying vec2 vUv;
  void main() {
      vUv = aPosition * 0.5 + 0.5;
      gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const clearShader = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform float value;
  void main() {
      gl_FragColor = value * texture2D(uTexture, vUv);
  }
`;

const initUVShader = `
  precision highp float;
  varying vec2 vUv;
  void main() {
      gl_FragColor = vec4(vUv, 0.0, 1.0);
  }
`;

const splatShader = `
  precision highp float;
  precision highp sampler2D;
  varying vec2 vUv;
  uniform sampler2D uTarget;
  uniform float aspectRatio;
  uniform vec3 color;
  uniform vec2 point;
  uniform float radius;

  void main() {
      vec2 p = vUv - point.xy;
      p.x *= aspectRatio;
      vec3 splat = exp(-dot(p, p) / radius) * color;
      vec3 base = texture2D(uTarget, vUv).xyz;
      gl_FragColor = vec4(base + splat, 1.0);
  }
`;

const advectionShader = `
  precision highp float;
  precision highp sampler2D;
  varying vec2 vUv;
  uniform sampler2D uVelocity;
  uniform sampler2D uSource;
  uniform vec2 texelSize;
  uniform float dt;
  uniform float dissipation;

  void main() {
      vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
      gl_FragColor = dissipation * texture2D(uSource, coord);
  }
`;

const divergenceShader = `
  precision highp float;
  precision highp sampler2D;
  varying vec2 vUv;
  uniform sampler2D uVelocity;
  uniform vec2 texelSize;
  void main() {
      float L = texture2D(uVelocity, vUv - vec2(texelSize.x, 0.0)).x;
      float R = texture2D(uVelocity, vUv + vec2(texelSize.x, 0.0)).x;
      float T = texture2D(uVelocity, vUv + vec2(0.0, texelSize.y)).y;
      float B = texture2D(uVelocity, vUv - vec2(0.0, texelSize.y)).y;
      float div = 0.5 * (R - L + T - B);
      gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
  }
`;

const pressureShader = `
  precision highp float;
  precision highp sampler2D;
  varying vec2 vUv;
  uniform sampler2D uPressure;
  uniform sampler2D uDivergence;
  uniform vec2 texelSize;
  void main() {
      float L = texture2D(uPressure, vUv - vec2(texelSize.x, 0.0)).x;
      float R = texture2D(uPressure, vUv + vec2(texelSize.x, 0.0)).x;
      float T = texture2D(uPressure, vUv + vec2(0.0, texelSize.y)).x;
      float B = texture2D(uPressure, vUv - vec2(0.0, texelSize.y)).x;
      float C = texture2D(uDivergence, vUv).x;
      float pressure = (L + R + B + T - C) * 0.25;
      gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
  }
`;

const gradientSubtractShader = `
  precision highp float;
  precision highp sampler2D;
  varying vec2 vUv;
  uniform sampler2D uPressure;
  uniform sampler2D uVelocity;
  uniform sampler2D uMask;
  uniform vec2 texelSize;
  void main() {
      float L = texture2D(uPressure, vUv - vec2(texelSize.x, 0.0)).x;
      float R = texture2D(uPressure, vUv + vec2(texelSize.x, 0.0)).x;
      float T = texture2D(uPressure, vUv + vec2(0.0, texelSize.y)).x;
      float B = texture2D(uPressure, vUv - vec2(0.0, texelSize.y)).x;
      vec2 velocity = texture2D(uVelocity, vUv).xy;
      
      // Masking logic: if masked, velocity is zero
      float mask = texture2D(uMask, vUv).r;
      if (mask > 0.5) {
          velocity = vec2(0.0);
      } else {
          velocity.xy -= vec2(R - L, T - B);
      }
      
      gl_FragColor = vec4(velocity, 0.0, 1.0);
  }
`;

const antiGravityShader = `
  precision highp float;
  precision highp sampler2D;
  varying vec2 vUv;
  uniform sampler2D uVelocity;
  uniform sampler2D uUVField;
  uniform vec2 uAntiGravity;
  uniform float dt;

  void main() {
      vec2 vel = texture2D(uVelocity, vUv).xy;
      
      // Calculate pseudo-density based on how much the UV field has displaced
      vec2 origUv = vUv;
      vec2 currUv = texture2D(uUVField, vUv).xy;
      float displacement = length(currUv - origUv);
      
      // Apply anti-gravity force proportional to displacement (buoyancy)
      float density = smoothstep(0.0, 0.2, displacement);
      vel += uAntiGravity * density * dt * 50.0;
      
      gl_FragColor = vec4(vel, 0.0, 1.0);
  }
`;

const displayShader = `
  precision highp float;
  precision highp sampler2D;
  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform sampler2D uUVField;
  uniform sampler2D uMaskField;
  uniform float uDistortionStrength;
  uniform float uShowMask;
  uniform float uMaskOpacity;
  uniform vec3 uMaskColor;

  void main() {
      vec2 distortedUv = texture2D(uUVField, vUv).xy;
      
      // Modulate by distortion strength (lerp between base UV and displaced UV)
      vec2 offset = distortedUv - vUv;
      vec2 finalUv = vUv + offset * uDistortionStrength;
      
      // Clamp to prevent edge bleeding artifacts
      finalUv = clamp(finalUv, 0.0, 1.0);
      
      vec4 baseColor = texture2D(uTexture, finalUv);
      
      // Optional mask rendering overlay
      float maskVal = texture2D(uMaskField, vUv).r;
      if (uShowMask > 0.5 && maskVal > 0.0) {
          vec3 mixed = mix(baseColor.rgb, uMaskColor, maskVal * uMaskOpacity);
          gl_FragColor = vec4(mixed, baseColor.a);
      } else {
          gl_FragColor = baseColor;
      }
  }
`;

interface FBO {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
}

interface DoubleFBO {
  read: FBO;
  write: FBO;
  swap: () => void;
}

class Program {
  gl: WebGLRenderingContext | WebGL2RenderingContext;
  program: WebGLProgram;
  uniforms: { [key: string]: WebGLUniformLocation | null } = {};

  constructor(gl: WebGLRenderingContext | WebGL2RenderingContext, vertexShaderSource: string, fragmentShaderSource: string) {
    this.gl = gl;
    this.program = this.createProgram(vertexShaderSource, fragmentShaderSource);
  }

  createShader(type: number, source: string) {
    const shader = this.gl.createShader(type)!;
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      throw new Error(this.gl.getShaderInfoLog(shader) || '');
    }
    return shader;
  }

  createProgram(vsSource: string, fsSource: string) {
    const vs = this.createShader(this.gl.VERTEX_SHADER, vsSource);
    const fs = this.createShader(this.gl.FRAGMENT_SHADER, fsSource);
    const prog = this.gl.createProgram()!;
    this.gl.attachShader(prog, vs);
    this.gl.attachShader(prog, fs);
    this.gl.linkProgram(prog);
    if (!this.gl.getProgramParameter(prog, this.gl.LINK_STATUS)) {
      throw new Error(this.gl.getProgramInfoLog(prog) || '');
    }
    return prog;
  }

  bind() {
    this.gl.useProgram(this.program);
  }

  getUniform(name: string) {
    if (this.uniforms[name] === undefined) {
      this.uniforms[name] = this.gl.getUniformLocation(this.program, name);
    }
    return this.uniforms[name];
  }
}

export class LiquifyEngine {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  
  private supportLinearFiltering: boolean = false;

  private imageTexture: WebGLTexture | null = null;
  private imageWidth = 0;
  private imageHeight = 0;

  private simWidth = 0;
  private simHeight = 0;
  private simRes = 512; // Fluid simulation resolution

  // Programs
  private clearProgram!: Program;
  private displayProgram!: Program;
  private splatProgram!: Program;
  private advectionProgram!: Program;
  private divergenceProgram!: Program;
  private pressureProgram!: Program;
  private gradienSubtractProgram!: Program;
  private antiGravityProgram!: Program;
  private initUVProgram!: Program;

  // FBOs
  private velocity!: DoubleFBO;
  private density!: DoubleFBO; // UV field
  private pressure!: DoubleFBO;
  private mask!: DoubleFBO;
  private divergence!: FBO;

  private blitQuadBuffer!: WebGLBuffer;

  private lastTime = 0;
  private animationFrameId = 0;



  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.initGL();
  }

  private initGL() {
    this.gl = this.canvas.getContext('webgl2', { preserveDrawingBuffer: true, alpha: false }) as WebGL2RenderingContext;
    if (!this.gl) {
      const msg = 'WebGL 2 is required but not supported by your browser.';
      console.error('[LiquifyEngine]', msg);
      alert(msg);
      throw new Error(msg);
    }
    const gl = this.gl;
    
    const extColorBufferFloat = gl.getExtension('EXT_color_buffer_float');
    if (!extColorBufferFloat) {
      const msg = 'EXT_color_buffer_float extension is required for fluid physics but not supported.';
      console.error('[LiquifyEngine]', msg);
      alert(msg);
      throw new Error(msg);
    }
    
    this.supportLinearFiltering = !!gl.getExtension('OES_texture_float_linear');
    
    // Quad buffer
    this.blitQuadBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.blitQuadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    
    this.initPrograms();
    this.initFBOs();

    this.lastTime = performance.now();
    this.step = this.step.bind(this);
    this.animationFrameId = requestAnimationFrame(this.step);
  }

  private initPrograms() {
    const gl = this.gl!;
    this.clearProgram = new Program(gl, baseVertexShader, clearShader);
    this.displayProgram = new Program(gl, baseVertexShader, displayShader);
    this.splatProgram = new Program(gl, baseVertexShader, splatShader);
    this.advectionProgram = new Program(gl, baseVertexShader, advectionShader);
    this.divergenceProgram = new Program(gl, baseVertexShader, divergenceShader);
    this.pressureProgram = new Program(gl, baseVertexShader, pressureShader);
    this.gradienSubtractProgram = new Program(gl, baseVertexShader, gradientSubtractShader);
    this.antiGravityProgram = new Program(gl, baseVertexShader, antiGravityShader);
    this.initUVProgram = new Program(gl, baseVertexShader, initUVShader);
  }

  private createFBO(w: number, h: number, internalFormat: number, format: number, type: number, param: number): FBO {
    const gl = this.gl!;
    gl.activeTexture(gl.TEXTURE0);
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    return { texture, fbo, width: w, height: h, texelSizeX: 1.0 / w, texelSizeY: 1.0 / h };
  }

  private createDoubleFBO(w: number, h: number, internalFormat: number, format: number, type: number, param: number): DoubleFBO {
    let fbo1 = this.createFBO(w, h, internalFormat, format, type, param);
    let fbo2 = this.createFBO(w, h, internalFormat, format, type, param);
    return {
      get read() { return fbo1; },
      set read(value) { fbo1 = value; },
      get write() { return fbo2; },
      set write(value) { fbo2 = value; },
      swap() {
        const temp = fbo1;
        fbo1 = fbo2;
        fbo2 = temp;
      }
    };
  }

  private initFBOs() {
    const gl = this.gl!;
    const w = this.simRes;
    const h = this.simRes;
    const filter = this.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
    const halfFloat = gl.HALF_FLOAT;
    const rgba = gl.RGBA;
    const rgba16f = gl.RGBA16F;

    this.velocity = this.createDoubleFBO(w, h, rgba16f, rgba, halfFloat, filter);
    this.density = this.createDoubleFBO(w, h, rgba16f, rgba, halfFloat, filter); // UV field
    this.pressure = this.createDoubleFBO(w, h, rgba16f, rgba, halfFloat, gl.NEAREST);
    this.mask = this.createDoubleFBO(w, h, rgba16f, rgba, halfFloat, gl.NEAREST);
    this.divergence = this.createFBO(w, h, rgba16f, rgba, halfFloat, gl.NEAREST);

    // Initialize the density (UV field) with base UV coordinates
    this.blit(this.density.read.fbo, this.initUVProgram);
    this.blit(this.density.write.fbo, this.initUVProgram);
  }

  private blit(target: WebGLFramebuffer | null, program: Program) {
    const gl = this.gl!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.blitQuadBuffer);
    const loc = gl.getAttribLocation(program.program, 'aPosition');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    gl.disableVertexAttribArray(loc);
  }

  public loadImage(img: HTMLImageElement) {
    this.originalImage = img;
    this.imageWidth = img.width;
    this.imageHeight = img.height;
    this.simWidth = this.imageWidth;
    this.simHeight = this.imageHeight;
    this.createImageTexture(img);
    this.render();
    this.saveHistoryState();
  }

  private originalImage: HTMLImageElement | null = null;
  private createImageTexture(img: HTMLImageElement) {
    const gl = this.gl!;
    if (this.imageTexture) gl.deleteTexture(this.imageTexture);
    this.imageTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  }

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
    antiGravityIntensity: 0.5,
    antiGravityDirection: Math.PI / 2,
    fluidViscosity: 0.2,
    densityDissipation: 0.98,
    velocityDissipation: 0.99,
    distortionStrength: 1.0,
    pressureIterations: 16
  };

  public updateSettings(settings: BrushSettings) {
    this.currentSettings = settings;
    this.render();
  }

  private parseColor(hex: string): [number, number, number] {
    const c = parseInt(hex.slice(1), 16);
    return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
  }

  public applyWarp(
    normX: number,
    normY: number,
    dragNormX: number,
    dragNormY: number,
    radiusNorm: number,
    strength: number,
    mode: ToolMode,
    aspectRatio: number
  ) {
    if (!this.gl) return;
    const gl = this.gl;
    
    const glNormY = 1.0 - normY;
    const glDragNormY = -dragNormY;

    if (mode === 'freeze' || mode === 'thaw') {
      this.splatProgram.bind();
      gl.uniform1i(this.splatProgram.getUniform('uTarget'), 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.mask.read.texture);
      
      const v = mode === 'freeze' ? 1.0 : -1.0;
      gl.uniform3f(this.splatProgram.getUniform('color'), v, 0.0, 0.0);
      gl.uniform2f(this.splatProgram.getUniform('point'), normX, glNormY);
      gl.uniform1f(this.splatProgram.getUniform('radius'), radiusNorm * radiusNorm * 0.25);
      gl.uniform1f(this.splatProgram.getUniform('aspectRatio'), aspectRatio);
      
      gl.viewport(0, 0, this.mask.read.width, this.mask.read.height);
      this.blit(this.mask.write.fbo, this.splatProgram);
      this.mask.swap();
      return;
    }

    let velX = 0;
    let velY = 0;
    
    if (mode === 'push') { // Blast Mode
      velX = dragNormX * strength * 5000.0;
      velY = glDragNormY * strength * 5000.0;
    } else if (mode === 'pull') { // Gravity Well / Pull (forces towards cursor)
      // For a proper pull, we'd calculate radial vectors in the splat shader.
      // We approximate it by creating a strong velocity towards the drag vector.
      velX = dragNormX * strength * 5000.0;
      velY = glDragNormY * strength * 5000.0;
    } else if (mode === 'vortex') { // Vortex Mode (rotational velocity)
      velX = -glDragNormY * strength * 5000.0;
      velY = dragNormX * strength * 5000.0;
    } else if (mode === 'reconstruct') {
       // Reconstruct is tricky in fluid sim, so we ignore or do a custom blend towards base UV
       return;
    }

    if (Math.abs(velX) < 0.0001 && Math.abs(velY) < 0.0001) return;

    this.splatProgram.bind();
    gl.uniform1i(this.splatProgram.getUniform('uTarget'), 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.uniform3f(this.splatProgram.getUniform('color'), velX, velY, 0.0);
    gl.uniform2f(this.splatProgram.getUniform('point'), normX, glNormY);
    gl.uniform1f(this.splatProgram.getUniform('radius'), radiusNorm * radiusNorm * 0.25);
    gl.uniform1f(this.splatProgram.getUniform('aspectRatio'), aspectRatio);
    
    gl.viewport(0, 0, this.velocity.read.width, this.velocity.read.height);
    this.blit(this.velocity.write.fbo, this.splatProgram);
    this.velocity.swap();
  }

  private step(time: number) {
    const dt = Math.min((time - this.lastTime) / 1000.0, 0.033);
    this.lastTime = time;
    
    if (this.gl && this.imageTexture) {
        this.simulateFluid(dt);
        this.render();
    }
    this.animationFrameId = requestAnimationFrame(this.step);
  }

  private simulateFluid(dt: number) {
    const gl = this.gl!;
    const w = this.simRes;
    const h = this.simRes;
    gl.viewport(0, 0, w, h);

    // 1. Anti-Gravity
    const agIntensity = this.currentSettings.antiGravityIntensity;
    if (agIntensity > 0.01) {
        this.antiGravityProgram.bind();
        gl.uniform1i(this.antiGravityProgram.getUniform('uVelocity'), 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
        
        gl.uniform1i(this.antiGravityProgram.getUniform('uUVField'), 1);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.density.read.texture);
        
        const dir = this.currentSettings.antiGravityDirection;
        gl.uniform2f(this.antiGravityProgram.getUniform('uAntiGravity'), Math.cos(dir) * agIntensity, Math.sin(dir) * agIntensity);
        gl.uniform1f(this.antiGravityProgram.getUniform('dt'), dt);
        
        this.blit(this.velocity.write.fbo, this.antiGravityProgram);
        this.velocity.swap();
    }

    // 2. Advect Velocity
    this.advectionProgram.bind();
    gl.uniform2f(this.advectionProgram.getUniform('texelSize'), this.velocity.read.texelSizeX, this.velocity.read.texelSizeY);
    gl.uniform1i(this.advectionProgram.getUniform('uVelocity'), 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.uniform1i(this.advectionProgram.getUniform('uSource'), 0); // Self-advection
    gl.uniform1f(this.advectionProgram.getUniform('dt'), dt);
    gl.uniform1f(this.advectionProgram.getUniform('dissipation'), this.currentSettings.velocityDissipation);
    this.blit(this.velocity.write.fbo, this.advectionProgram);
    this.velocity.swap();

    // 3. Advect Density (UV Field)
    this.advectionProgram.bind();
    gl.uniform1i(this.advectionProgram.getUniform('uVelocity'), 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.uniform1i(this.advectionProgram.getUniform('uSource'), 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.density.read.texture);
    gl.uniform1f(this.advectionProgram.getUniform('dissipation'), 1.0); // Never dissipate the coordinate field itself
    this.blit(this.density.write.fbo, this.advectionProgram);
    this.density.swap();

    // 4. Divergence
    this.divergenceProgram.bind();
    gl.uniform2f(this.divergenceProgram.getUniform('texelSize'), this.velocity.read.texelSizeX, this.velocity.read.texelSizeY);
    gl.uniform1i(this.divergenceProgram.getUniform('uVelocity'), 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    this.blit(this.divergence.fbo, this.divergenceProgram);

    // 5. Clear Pressure
    this.clearProgram.bind();
    gl.uniform1i(this.clearProgram.getUniform('uTexture'), 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pressure.read.texture);
    gl.uniform1f(this.clearProgram.getUniform('value'), 0.8);
    this.blit(this.pressure.write.fbo, this.clearProgram);
    this.pressure.swap();

    // 6. Pressure Solve (Jacobi Iterations)
    this.pressureProgram.bind();
    gl.uniform2f(this.pressureProgram.getUniform('texelSize'), this.velocity.read.texelSizeX, this.velocity.read.texelSizeY);
    gl.uniform1i(this.pressureProgram.getUniform('uDivergence'), 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.divergence.texture);
    gl.uniform1i(this.pressureProgram.getUniform('uPressure'), 0);
    gl.activeTexture(gl.TEXTURE0);
    const iterations = this.currentSettings.pressureIterations;
    for (let i = 0; i < iterations; i++) {
        gl.bindTexture(gl.TEXTURE_2D, this.pressure.read.texture);
        this.blit(this.pressure.write.fbo, this.pressureProgram);
        this.pressure.swap();
    }

    // 7. Gradient Subtraction (Applying pressure and mask)
    this.gradienSubtractProgram.bind();
    gl.uniform2f(this.gradienSubtractProgram.getUniform('texelSize'), this.velocity.read.texelSizeX, this.velocity.read.texelSizeY);
    gl.uniform1i(this.gradienSubtractProgram.getUniform('uPressure'), 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pressure.read.texture);
    gl.uniform1i(this.gradienSubtractProgram.getUniform('uVelocity'), 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.uniform1i(this.gradienSubtractProgram.getUniform('uMask'), 2);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.mask.read.texture);
    
    this.blit(this.velocity.write.fbo, this.gradienSubtractProgram);
    this.velocity.swap();
  }

  public render() {
    if (!this.gl || !this.imageTexture) return;
    const gl = this.gl;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.02, 0.04, 0.02, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    this.displayProgram.bind();
    
    gl.uniform1i(this.displayProgram.getUniform('uTexture'), 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    
    gl.uniform1i(this.displayProgram.getUniform('uUVField'), 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.density.read.texture);

    gl.uniform1i(this.displayProgram.getUniform('uMaskField'), 2);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.mask.read.texture);

    const activeStrength = this.isComparing ? 0.0 : this.currentSettings.distortionStrength;
    gl.uniform1f(this.displayProgram.getUniform('uDistortionStrength'), activeStrength);
    gl.uniform1f(this.displayProgram.getUniform('uShowMask'), this.currentSettings.showMask ? 1.0 : 0.0);
    gl.uniform1f(this.displayProgram.getUniform('uMaskOpacity'), this.currentSettings.maskOpacity);
    const mColor = this.parseColor(this.currentSettings.maskColor);
    gl.uniform3f(this.displayProgram.getUniform('uMaskColor'), mColor[0], mColor[1], mColor[2]);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.blit(null, this.displayProgram);
  }

  // Hybrid History Stack
  private history: { type: 'texture' | 'array'; texture?: WebGLTexture; data?: Float32Array }[] = [];
  private historyIndex = -1;
  private maxHistory = 40;
  private maxVramSnapshots = 5;

  public saveHistoryState() {
    const gl = this.gl!;
    if (!gl) return;
    
    const w = this.density.read.width;
    const h = this.density.read.height;

    // Create a new texture snapshot in VRAM
    const snapshotTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, snapshotTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this.supportLinearFiltering ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this.supportLinearFiltering ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    // Copy current density FBO into the new texture
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.density.read.fbo);
    gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 0, 0, w, h, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    if (this.historyIndex < this.history.length - 1) {
      // Clear discarded forward history
      const discarded = this.history.slice(this.historyIndex + 1);
      discarded.forEach(item => {
          if (item.type === 'texture' && item.texture) {
              gl.deleteTexture(item.texture);
          }
      });
      this.history = this.history.slice(0, this.historyIndex + 1);
    }
    
    this.history.push({ type: 'texture', texture: snapshotTexture });
    this.historyIndex++;
    
    if (this.history.length > this.maxHistory) {
      const oldest = this.history.shift();
      if (oldest?.type === 'texture' && oldest.texture) {
          gl.deleteTexture(oldest.texture);
      }
      this.historyIndex--;
    }

    // Convert old textures to CPU arrays to save VRAM
    for (let i = 0; i <= this.historyIndex - this.maxVramSnapshots; i++) {
        const item = this.history[i];
        if (item.type === 'texture' && item.texture) {
            const data = new Float32Array(w * h * 4);
            
            // We must bind the texture to an FBO to read its pixels
            const tempFbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, tempFbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, item.texture, 0);
            gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, data);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.deleteFramebuffer(tempFbo);
            
            gl.deleteTexture(item.texture);
            this.history[i] = { type: 'array', data };
        }
    }
  }

  public canUndo() { return this.historyIndex > 0; }
  public canRedo() { return this.historyIndex < this.history.length - 1; }

  public undo() {
    if (!this.canUndo()) return;
    this.historyIndex--;
    this.restoreHistoryState(this.history[this.historyIndex]);
  }

  public redo() {
    if (!this.canRedo()) return;
    this.historyIndex++;
    this.restoreHistoryState(this.history[this.historyIndex]);
  }

  public reset() {
    this.history.forEach(item => {
        if (item.type === 'texture' && item.texture) {
            this.gl!.deleteTexture(item.texture);
        }
    });
    this.history = [];
    this.historyIndex = -1;
    // Clear velocity
    this.clearProgram.bind();
    this.gl!.uniform1i(this.clearProgram.getUniform('uTexture'), 0);
    this.gl!.activeTexture(this.gl!.TEXTURE0);
    this.gl!.bindTexture(this.gl!.TEXTURE_2D, this.velocity.read.texture);
    this.gl!.uniform1f(this.clearProgram.getUniform('value'), 0.0);
    this.blit(this.velocity.write.fbo, this.clearProgram);
    this.velocity.swap();
    this.blit(this.velocity.write.fbo, this.clearProgram);
    this.velocity.swap();
    // Reset UV density field
    this.blit(this.density.read.fbo, this.initUVProgram);
    this.blit(this.density.write.fbo, this.initUVProgram);
    // Reset mask
    this.gl!.bindTexture(this.gl!.TEXTURE_2D, this.mask.read.texture);
    this.blit(this.mask.write.fbo, this.clearProgram);
    this.mask.swap();
    this.blit(this.mask.write.fbo, this.clearProgram);
    this.mask.swap();
    
    this.saveHistoryState();
  }

  public clearMask() {
    this.clearProgram.bind();
    this.gl!.bindTexture(this.gl!.TEXTURE_2D, this.mask.read.texture);
    this.blit(this.mask.write.fbo, this.clearProgram);
    this.mask.swap();
    this.blit(this.mask.write.fbo, this.clearProgram);
    this.mask.swap();
  }

  private isComparing = false;

  public setComparing(isComparing: boolean) {
    this.isComparing = isComparing;
    this.render();
  }

  private restoreHistoryState(item: { type: 'texture' | 'array'; texture?: WebGLTexture; data?: Float32Array }) {
    const gl = this.gl!;
    if (item.type === 'texture' && item.texture) {
        // Blit from snapshot texture to density FBO
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.density.write.fbo);
        this.clearProgram.bind();
        gl.uniform1i(this.clearProgram.getUniform('uTexture'), 0);
        gl.uniform1f(this.clearProgram.getUniform('value'), 1.0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, item.texture);
        this.blit(this.density.write.fbo, this.clearProgram);
        this.density.swap();
    } else if (item.type === 'array' && item.data) {
        // Upload from Float32Array
        gl.bindTexture(gl.TEXTURE_2D, this.density.read.texture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.density.read.width, this.density.read.height, gl.RGBA, gl.FLOAT, item.data);
    }
    this.render();
  }
  
  public getExportDataUrl(settings: ExportSettings): Promise<string> {
      return new Promise((resolve) => {
          // Temporarily resize canvas to original image dimensions for high-res export
          // In a true fluid sim, you'd upsample the UV field and apply it to a high-res texture
          // For now, we return the canvas data URL
          resolve(this.canvas.toDataURL(settings.format, settings.quality));
      });
  }

  public destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.history.forEach(item => {
      if (item.type === 'texture' && item.texture) {
        this.gl!.deleteTexture(item.texture);
      }
    });
  }
}

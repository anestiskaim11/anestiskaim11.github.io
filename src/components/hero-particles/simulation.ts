import * as THREE from "three";
import { GPUComputationRenderer, type Variable } from "three/examples/jsm/misc/GPUComputationRenderer.js";
import { positionShader, renderFragmentShader, renderVertexShader, velocityShader } from "./shaders";
import { SHAPES } from "./shapes";

export interface ParticleSimulationOptions {
  width: number;
  height: number;
  /** Simulation texture side; particle count is size². */
  size: number;
  reducedMotion: boolean;
}

type Phase = "drift" | "forming" | "hold" | "release";

const FOV = 50;
const CAMERA_Z = 6;
const FIRST_DRIFT_SECONDS = 4;
const PHASE_SECONDS: Record<Phase, number> = { drift: 9, forming: 2.2, hold: 4.5, release: 1.6 };
const NEXT_PHASE: Record<Phase, Phase> = { drift: "forming", forming: "hold", hold: "release", release: "drift" };
/** Approximate width of the hero content column (max-w-4xl plus padding). */
const CONTENT_WIDTH_PX = 940;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * GPU particle nebula: position/velocity live in float textures updated by
 * GPUComputationRenderer, and a THREE.Points cloud reads them back for drawing.
 */
export class ParticleSimulation {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  private readonly gpu: GPUComputationRenderer;
  private readonly posVar: Variable;
  private readonly velVar: Variable;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly shapeTextures: THREE.DataTexture[];
  private readonly count: number;

  private halfW = 1;
  private halfH = 1;
  private time = 0;
  private phase: Phase = "drift";
  private phaseTime = 0;
  private phaseDuration = FIRST_DRIFT_SECONDS;
  private shapeIndex = 0;
  private shapeTime = 0;
  private form = 0;
  private scroll = 0;
  private shockAge = 100;

  private readonly pointerTarget = new THREE.Vector3();
  private readonly pointer = new THREE.Vector3();
  private readonly pointerVel = new THREE.Vector3();
  private readonly prevPointer = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();
  private pointerWanted = false;
  private pointerActive = 0;

  private readonly targetMatrix4 = new THREE.Matrix4();
  private readonly targetMatrix = new THREE.Matrix3();

  constructor(canvas: HTMLCanvasElement, options: ParticleSimulationOptions) {
    const { size } = options;
    this.count = size * size;

    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x000000, 0);

    const floatTargets = this.renderer.extensions.has("EXT_color_buffer_float");
    const halfTargets = this.renderer.extensions.has("EXT_color_buffer_half_float");
    if (!floatTargets && !halfTargets) {
      this.renderer.dispose();
      throw new Error("Float render targets are not supported");
    }

    this.camera.position.z = CAMERA_Z;
    this.resize(options.width, options.height);

    this.gpu = new GPUComputationRenderer(size, size, this.renderer);
    if (!floatTargets) this.gpu.setDataType(THREE.HalfFloatType);

    const pos0 = this.gpu.createTexture();
    const vel0 = this.gpu.createTexture();
    this.seedParticles(pos0.image.data as unknown as Float32Array, vel0.image.data as unknown as Float32Array, options.reducedMotion);

    this.posVar = this.gpu.addVariable("texturePosition", positionShader, pos0);
    this.velVar = this.gpu.addVariable("textureVelocity", velocityShader, vel0);
    this.gpu.setVariableDependencies(this.posVar, [this.posVar, this.velVar]);
    this.gpu.setVariableDependencies(this.velVar, [this.posVar, this.velVar]);

    this.shapeTextures = SHAPES.map(() => {
      const texture = new THREE.DataTexture(new Float32Array(this.count * 4), size, size, THREE.RGBAFormat, THREE.FloatType);
      texture.needsUpdate = true;
      return texture;
    });
    this.rebuildShapes();

    Object.assign(this.posVar.material.uniforms, { uDelta: { value: 0 } });
    Object.assign(this.velVar.material.uniforms, {
      uTime: { value: 0 },
      uDelta: { value: 0 },
      uForm: { value: 0 },
      uTarget: { value: this.shapeTextures[0] },
      uTargetMatrix: { value: this.targetMatrix },
      uPointer: { value: this.pointer },
      uPointerVel: { value: this.pointerVel },
      uPointerActive: { value: 0 },
      uShockOrigin: { value: new THREE.Vector3() },
      uShockAge: { value: this.shockAge },
      uBounds: { value: new THREE.Vector2(this.halfW * 1.05, this.halfH * 1.05) },
    });

    const error = this.gpu.init();
    if (error !== null) {
      this.dispose();
      throw new Error(error);
    }

    const references = new Float32Array(this.count * 2);
    for (let i = 0; i < this.count; i++) {
      references[i * 2] = ((i % size) + 0.5) / size;
      references[i * 2 + 1] = (Math.floor(i / size) + 0.5) / size;
    }
    this.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(this.count * 3), 3));
    this.geometry.setAttribute("reference", new THREE.BufferAttribute(references, 2));

    const dense = size >= 256;
    this.material = new THREE.ShaderMaterial({
      vertexShader: renderVertexShader,
      fragmentShader: renderFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uPos: { value: null },
        uVel: { value: null },
        uTime: { value: 0 },
        uSize: { value: dense ? 2.5 : 3.0 },
        uPixelRatio: { value: this.renderer.getPixelRatio() },
        uAlpha: { value: dense ? 0.75 : 0.95 },
        uOpacity: { value: 1 },
        uForm: { value: 0 },
        uMask: { value: this.contentMask(options.width) },
        uMaskFloor: { value: this.maskFloor(options.width) },
      },
    });

    const points = new THREE.Points(this.geometry, this.material);
    points.frustumCulled = false;
    this.scene.add(points);
  }

  /** Resizes the drawing buffer and camera. Call `rebuildShapes` afterwards (debounced) to refit targets. */
  resize(width: number, height: number) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.halfH = CAMERA_Z * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    this.halfW = this.halfH * this.camera.aspect;

    if (this.velVar) (this.velVar.material.uniforms.uBounds.value as THREE.Vector2).set(this.halfW * 1.05, this.halfH * 1.05);
    if (this.material) {
      this.material.uniforms.uPixelRatio.value = this.renderer.getPixelRatio();
      this.material.uniforms.uMask.value = this.contentMask(width);
      this.material.uniforms.uMaskFloor.value = this.maskFloor(width);
    }
  }

  /** Regenerates every shape's target cloud for the current viewport. */
  rebuildShapes() {
    SHAPES.forEach((shape, i) => {
      const texture = this.shapeTextures[i];
      shape.generate(texture.image.data as unknown as Float32Array, this.count, this.halfW, this.halfH);
      texture.needsUpdate = true;
    });
  }

  /** Pointer position in normalised device coordinates (-1..1, y up). */
  setPointer(ndcX: number, ndcY: number) {
    this.ndcToWorld(ndcX, ndcY, this.pointerTarget);
    if (this.pointerActive < 0.05) {
      this.pointer.copy(this.pointerTarget);
      this.prevPointer.copy(this.pointerTarget);
    }
    this.pointerWanted = true;
  }

  clearPointer() {
    this.pointerWanted = false;
  }

  shockwave(ndcX: number, ndcY: number) {
    this.ndcToWorld(ndcX, ndcY, this.velVar.material.uniforms.uShockOrigin.value as THREE.Vector3);
    this.shockAge = 0;
  }

  /** Hero scroll progress, 0 (top) to 1 (scrolled past). */
  setScroll(progress: number) {
    this.scroll = THREE.MathUtils.clamp(progress, 0, 1);
  }

  tick(deltaSeconds: number) {
    this.step(Math.min(Math.max(deltaSeconds, 0), 1 / 30));
    this.render();
  }

  /** Runs simulation steps without drawing, e.g. to give a static frame some structure. */
  prewarm(steps: number) {
    for (let i = 0; i < steps; i++) this.step(1 / 60);
  }

  render() {
    this.camera.position.z = CAMERA_Z + this.scroll * 2.5;
    const u = this.material.uniforms;
    u.uPos.value = this.gpu.getCurrentRenderTarget(this.posVar).texture;
    u.uVel.value = this.gpu.getCurrentRenderTarget(this.velVar).texture;
    u.uTime.value = this.time;
    u.uForm.value = this.form;
    u.uOpacity.value = 1 - this.scroll * 0.7;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.gpu?.dispose();
    this.shapeTextures?.forEach((t) => t.dispose());
    this.geometry.dispose();
    this.material?.dispose();
    this.renderer.dispose();
  }

  private step(dt: number) {
    this.time += dt;
    this.shockAge += dt;
    this.updateCycle(dt);
    this.updatePointer(dt);

    SHAPES[this.shapeIndex].motion(this.shapeTime, this.targetMatrix4);
    this.targetMatrix.setFromMatrix4(this.targetMatrix4);

    const v = this.velVar.material.uniforms;
    v.uTime.value = this.time;
    v.uDelta.value = dt;
    v.uForm.value = this.form;
    v.uPointerActive.value = this.pointerActive;
    v.uShockAge.value = this.shockAge;
    this.posVar.material.uniforms.uDelta.value = dt;
    this.gpu.compute();
  }

  private updateCycle(dt: number) {
    this.phaseTime += dt;
    this.shapeTime += dt;
    if (this.phaseTime >= this.phaseDuration) {
      this.phase = NEXT_PHASE[this.phase];
      this.phaseTime = 0;
      this.phaseDuration = PHASE_SECONDS[this.phase];
      if (this.phase === "forming") {
        this.shapeTime = 0;
        this.velVar.material.uniforms.uTarget.value = this.shapeTextures[this.shapeIndex];
      } else if (this.phase === "drift") {
        this.shapeIndex = (this.shapeIndex + 1) % SHAPES.length;
      }
    }

    const t = this.phaseTime / this.phaseDuration;
    this.form = { drift: 0, forming: easeInOut(t), hold: 1, release: 1 - easeInOut(t) }[this.phase];
  }

  private updatePointer(dt: number) {
    this.prevPointer.copy(this.pointer);
    this.pointer.lerp(this.pointerTarget, 1 - Math.exp(-dt * 12));
    const instant = this.scratch.copy(this.pointer).sub(this.prevPointer).divideScalar(Math.max(dt, 1e-3));
    this.pointerVel.lerp(instant, 1 - Math.exp(-dt * 8)).clampLength(0, 8);
    this.pointerActive += ((this.pointerWanted ? 1 : 0) - this.pointerActive) * (1 - Math.exp(-dt * 5));
  }

  private ndcToWorld(ndcX: number, ndcY: number, out: THREE.Vector3) {
    const halfH = this.camera.position.z * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    return out.set(ndcX * halfH * this.camera.aspect, ndcY * halfH, 0);
  }

  // On narrow screens the content spans the full width, so dim less or the nebula disappears.
  private maskFloor(widthPx: number) {
    return widthPx < 768 ? 0.6 : 0.3;
  }

  private contentMask(widthPx: number) {
    return new THREE.Vector2(Math.min(1, CONTENT_WIDTH_PX / Math.max(widthPx, 1)), 0.8);
  }

  private seedParticles(pos: Float32Array, vel: Float32Array, reducedMotion: boolean) {
    for (let i = 0; i < this.count; i++) {
      const o = i * 4;
      const a = Math.random() * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), Math.sin(a), (Math.random() - 0.5) * 0.8).normalize();
      if (reducedMotion) {
        // Static frame: spread across the hero.
        const r = Math.sqrt(Math.random());
        pos.set([dir.x * r * this.halfW, dir.y * r * this.halfH, (Math.random() - 0.5) * 2, Math.random()], o);
        vel.set([0, 0, 0, 1], o);
      } else {
        // Intro: a big-bang burst from the centre that the flow field then catches.
        const r = Math.abs(Math.random() + Math.random() - 1) * 0.15;
        const speed = 1.5 + Math.random() * 3.5;
        pos.set([dir.x * r, dir.y * r, dir.z * r, Math.random()], o);
        vel.set([dir.x * speed * Math.sqrt(this.camera.aspect), dir.y * speed, dir.z * speed, 1], o);
      }
    }
  }
}

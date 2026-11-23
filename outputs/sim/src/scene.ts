import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { KM } from './physics';
import { Mulberry32 } from './physics/SimulationClock';
import type { SpaceBody, StateVector, LifecycleState } from './types/orbital';

const EXAG = 20;
const UP = new THREE.Vector3(0, 1, 0);

function createArrowGeometry(): THREE.BufferGeometry {
  const shaft = new THREE.CylinderGeometry(0.032, 0.032, 0.70, 8);
  shaft.translate(0, 0.35, 0);
  const head = new THREE.ConeGeometry(0.085, 0.30, 8);
  head.translate(0, 0.85, 0);
  const merged = mergeGeometries([shaft, head]);
  shaft.dispose();
  head.dispose();
  return merged;
}

export const COL = {
  sat: 0x3b82f6,
  safe: 0x10b981,
  warn: 0xffc24b,
  crit: 0xff4136,
  dim: 0x8c9098,
  neonGreen: 0x34E858,
  neonGreenEmissive: 0x22C55E,
  coldGasWhite: 0xFFFFFF,
  coldGasMist: 0xD1FAE5,
};

export const DEBRIS_PALETTE = [
  0x525c68, // Gunmetal (#525C68)
  0x6e7b8b, // Slate Alloy (#6E7B8B)
  0x8a96a3, // Weathered Titanium (#8A96A3)
  0x3b424c, // Dark Char (#3B424C)
];

export function createCraggyDebrisGeometry(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(0.18, 1);
  const pos = geo.attributes.position;
  const hashDisplacements = new Map<string, number>();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const key = `${Math.round(x * 10000)},${Math.round(y * 10000)},${Math.round(z * 10000)}`;

    let factor = hashDisplacements.get(key);
    if (factor === undefined) {
      const noise =
        0.98 +
        0.24 * Math.sin(3.1 * x + 1.7 * y) * Math.cos(2.3 * z) +
        0.1 * Math.sin(7.3 * y - 4.1 * z);
      factor = Math.max(0.68, Math.min(1.28, noise));
      hashDisplacements.set(key, factor);
    }
    pos.setXYZ(i, x * factor, y * factor, z * factor);
  }
  geo.computeVertexNormals();
  return geo;
}

export function createEarthFallbackTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;

  // Deep Blue Oceans with subtle equator gradient
  const oceanGrad = g.createLinearGradient(0, 0, 0, h);
  oceanGrad.addColorStop(0, '#0c2744');
  oceanGrad.addColorStop(0.3, '#143c68');
  oceanGrad.addColorStop(0.5, '#1b4d82');
  oceanGrad.addColorStop(0.7, '#143c68');
  oceanGrad.addColorStop(1, '#0c2744');
  g.fillStyle = oceanGrad;
  g.fillRect(0, 0, w, h);

  // Continents shapes (Africa, Europe, Americas, Asia, Australia)
  g.fillStyle = '#2d5e3f';

  // Africa & Mediterranean
  g.beginPath();
  g.ellipse(w * 0.52, h * 0.50, w * 0.08, h * 0.20, 0.1, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(w * 0.52, h * 0.28, w * 0.07, h * 0.11, 0, 0, Math.PI * 2);
  g.fill();

  // Americas
  g.beginPath();
  g.ellipse(w * 0.24, h * 0.32, w * 0.09, h * 0.15, -0.2, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(w * 0.30, h * 0.65, w * 0.065, h * 0.20, 0.2, 0, Math.PI * 2);
  g.fill();

  // Eurasia & India
  g.beginPath();
  g.ellipse(w * 0.72, h * 0.30, w * 0.16, h * 0.16, 0.05, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(w * 0.68, h * 0.46, w * 0.035, h * 0.07, 0, 0, Math.PI * 2);
  g.fill();

  // Australia
  g.beginPath();
  g.ellipse(w * 0.82, h * 0.72, w * 0.06, h * 0.07, 0, 0, Math.PI * 2);
  g.fill();

  // Desert / Tan Highlands
  g.fillStyle = '#6e6244';
  g.beginPath();
  g.ellipse(w * 0.52, h * 0.40, w * 0.06, h * 0.07, 0, 0, Math.PI * 2); // Sahara
  g.fill();
  g.beginPath();
  g.ellipse(w * 0.63, h * 0.38, w * 0.04, h * 0.05, 0, 0, Math.PI * 2); // Arabia
  g.fill();

  // Polar ice caps
  g.fillStyle = '#f4f9ff';
  g.fillRect(0, 0, w, h * 0.07);
  g.fillRect(0, h * 0.91, w, h * 0.09);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCloudFallbackTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;

  g.fillStyle = 'rgba(0,0,0,0)';
  g.fillRect(0, 0, w, h);

  g.fillStyle = 'rgba(255, 255, 255, 0.42)';
  for (let i = 0; i < 24; i++) {
    const cx = (i * 47) % w;
    const cy = 35 + (i * 29) % (h - 70);
    g.beginPath();
    g.ellipse(cx, cy, 35 + (i % 5) * 12, 12 + (i % 3) * 6, (i * 0.3), 0, Math.PI * 2);
    g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const toScene = (r: number[]): THREE.Vector3 => new THREE.Vector3(r[0] * KM, r[2] * KM, -r[1] * KM);
const SAFE_UNIT = 5 * KM * EXAG;

function radialTex(stops: [number, string][], size = 64): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => grd.addColorStop(o, col));
  g.fillStyle = grd;
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2, 0, 7);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function ringTex(size = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#ff4f00';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2 - 8, 0, 7);
  g.stroke();
  g.globalAlpha = 0.35;
  g.lineWidth = 10;
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2 - 8, 0, 7);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function labelSprite(text: string, color = '#ece9e3'): THREE.Sprite {
  const pad = 12,
    fs = 30;
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  g.font = `500 ${fs}px "IBM Plex Mono", monospace`;
  const w = Math.ceil(g.measureText(text).width) + pad * 2;
  c.width = w;
  c.height = fs + pad * 2;
  const g2 = c.getContext('2d')!;
  g2.font = `500 ${fs}px "IBM Plex Mono", monospace`;
  g2.fillStyle = 'rgba(8,10,13,.72)';
  g2.fillRect(0, 0, c.width, c.height);
  g2.strokeStyle = 'rgba(236,233,227,.18)';
  g2.strokeRect(0.5, 0.5, c.width - 1, c.height - 1);
  g2.fillStyle = color;
  g2.textBaseline = 'middle';
  g2.fillText(text, pad, c.height / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true });
  const s = new THREE.Sprite(m);
  const k = 0.0026;
  s.scale.set(c.width * k, c.height * k, 1);
  return s;
}

/**
 * ThrusterPlume - Zero-GC Cold-Gas RCS Exhaust Plume System
 * 
 * Pre-allocates a pool of 72 soft white/ice-mist particles using THREE.Points
 * with additive blending for a crisp, unmistakable thruster jet effect.
 * Particles are recycled during BURNING phase with tight cone spread (±14°)
 * opposite to the thrust direction (Newton's 3rd Law).
 */
export class ThrusterPlume {
  private points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private positions: Float32Array;
  private velocities: Float32Array;
  private lifetimes: Float32Array;
  private maxLifetimes: Float32Array;
  private scales: Float32Array;
  private alphas: Float32Array;
  private activeCount: number = 0;
  private particleCount: number = 72;
  private texture: THREE.CanvasTexture;
  private exhaustDir: THREE.Vector3 = new THREE.Vector3(0, 0, -1);
  private nozzlePos: THREE.Vector3 = new THREE.Vector3();
  private emitting: boolean = false;
  private emitTimer: number = 0;
  private readonly emitDuration: number = 2.5; // seconds of wall-clock emission during initial deflection
  private readonly particleLifetime: number = 0.65; // seconds
  private readonly coneAngle: number = Math.PI / 13; // ~14 degrees
  private readonly baseScale: number = 0.5;
  private readonly maxScale: number = 2.0;
  private readonly nozzleCore: THREE.Sprite;
  private nozzleCoreMaterial: THREE.SpriteMaterial;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    
    // Create soft radial particle texture (white core fading to translucent mist)
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, '#FFFFFF');      // Pure white core
    grad.addColorStop(0.3, '#E8F5E9');    // Very pale green tint
    grad.addColorStop(0.6, '#C8E6C9');    // Soft mint
    grad.addColorStop(1, 'rgba(209,250,229,0)'); // Transparent edge
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;

    // Pre-allocate particle data arrays
    this.positions = new Float32Array(this.particleCount * 3);
    this.velocities = new Float32Array(this.particleCount * 3);
    this.lifetimes = new Float32Array(this.particleCount);
    this.maxLifetimes = new Float32Array(this.particleCount);
    this.scales = new Float32Array(this.particleCount);
    this.alphas = new Float32Array(this.particleCount);

    // Initialize all particles as inactive
    for (let i = 0; i < this.particleCount; i++) {
      this.lifetimes[i] = -1;
      this.maxLifetimes[i] = this.particleLifetime;
      this.positions[i * 3] = 0;
      this.positions[i * 3 + 1] = 0;
      this.positions[i * 3 + 2] = 0;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('aScale', new THREE.BufferAttribute(this.scales, 1));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));

    const material = new THREE.PointsMaterial({
      map: this.texture,
      size: 1,
      vertexColors: false,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      color: 0xFFFFFF,
    });

    // Custom shader for per-particle scale and alpha
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `
          #include <common>
          attribute float aScale;
          attribute float aAlpha;
          varying float vAlpha;
          varying float vScale;
        `)
        .replace('gl_PointSize = size;', `
          vAlpha = aAlpha;
          vScale = aScale;
          gl_PointSize = size * aScale * (900.0 / -mvPosition.z);
        `);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `
          #include <common>
          varying float vAlpha;
          varying float vScale;
        `)
        .replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );', `
          gl_FragColor = vec4( outgoingLight, vAlpha );
        `);
    };

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    // Nozzle core flare sprite
    const coreCanvas = document.createElement('canvas');
    coreCanvas.width = coreCanvas.height = 32;
    const coreCtx = coreCanvas.getContext('2d')!;
    const coreGrad = coreCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
    coreGrad.addColorStop(0, '#FFFFFF');
    coreGrad.addColorStop(0.3, '#A7F3D0');
    coreGrad.addColorStop(1, 'rgba(52,232,88,0)');
    coreCtx.fillStyle = coreGrad;
    coreCtx.beginPath();
    coreCtx.arc(16, 16, 16, 0, Math.PI * 2);
    coreCtx.fill();
    const coreTexture = new THREE.CanvasTexture(coreCanvas);
    coreTexture.colorSpace = THREE.SRGBColorSpace;

    this.nozzleCoreMaterial = new THREE.SpriteMaterial({
      map: coreTexture,
      color: 0x34E858,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0,
    });
    this.nozzleCore = new THREE.Sprite(this.nozzleCoreMaterial);
    this.nozzleCore.scale.set(0.4, 0.4, 1);
    this.nozzleCore.visible = false;
    this.scene.add(this.nozzleCore);
  }

  /**
   * Set the exhaust direction (opposite to thrust direction per Newton's 3rd Law)
   * and nozzle position for emission.
   */
  setExhaustDirection(thrustDir: THREE.Vector3, nozzleWorldPos: THREE.Vector3): void {
    this.exhaustDir.copy(thrustDir).negate().normalize();
    this.nozzlePos.copy(nozzleWorldPos);
    this.nozzleCore.position.copy(nozzleWorldPos);
  }

  /**
   * Start emitting particles (called when entering BURNING phase)
   */
  startEmission(): void {
    this.emitting = true;
    this.emitTimer = 0;
    this.nozzleCore.visible = true;
    this.nozzleCoreMaterial.opacity = 1;
  }

  /**
   * Stop emitting particles (called when exiting BURNING phase)
   */
  stopEmission(): void {
    this.emitting = false;
    // Fade out nozzle core
    this.nozzleCoreMaterial.opacity = 0;
    this.nozzleCore.visible = false;
  }

  /**
   * Update the plume - call once per frame
   * @param dtReal Real delta time in seconds
   * @param camDist Camera distance for scaling
   */
  update(dtReal: number, camDist: number): void {
    // Scale plume dimensions with camera distance
    const scaleFactor = THREE.MathUtils.clamp(camDist * 0.045, 0.25, 1.8);
    const baseScale = this.baseScale * scaleFactor;
    const maxScale = this.maxScale * scaleFactor;

    // Update nozzle core pulse
    if (this.emitting) {
      const pulse = 0.85 + 0.15 * Math.sin(performance.now() * 0.008);
      this.nozzleCore.scale.set(0.4 * pulse * scaleFactor, 0.4 * pulse * scaleFactor, 1);
    }

    // Emit new particles during emission phase
    if (this.emitting) {
      this.emitTimer += dtReal;
      if (this.emitTimer <= this.emitDuration) {
        // Emit ~12 particles per frame during active burn
        const emitRate = 12;
        for (let i = 0; i < emitRate && this.activeCount < this.particleCount; i++) {
          this.spawnParticle(baseScale, maxScale);
        }
      } else {
        this.emitting = false;
        this.nozzleCoreMaterial.opacity = 0;
        this.nozzleCore.visible = false;
      }
    }

    // Update all active particles
    const positions = this.positions;
    const velocities = this.velocities;
    const lifetimes = this.lifetimes;
    const scales = this.scales;
    const alphas = this.alphas;

    for (let i = 0; i < this.particleCount; i++) {
      if (lifetimes[i] <= 0) continue;

      lifetimes[i] -= dtReal;
      if (lifetimes[i] <= 0) {
        lifetimes[i] = -1;
        this.activeCount--;
        continue;
      }

      // Update position
      const idx = i * 3;
      positions[idx] += velocities[idx] * dtReal;
      positions[idx + 1] += velocities[idx + 1] * dtReal;
      positions[idx + 2] += velocities[idx + 2] * dtReal;

      // Scale up over lifetime (0.08 -> 0.48)
      const lifeRatio = 1.0 - lifetimes[i] / this.maxLifetimes[i];
      scales[i] = baseScale + (maxScale - baseScale) * lifeRatio;

      // Fade out smoothly
      alphas[i] = 0.85 * (1.0 - lifeRatio * lifeRatio); // Quadratic fade for smooth dissipation
    }

    // Update buffer attributes
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aScale.needsUpdate = true;
    this.points.geometry.attributes.aAlpha.needsUpdate = true;
  }

  /**
   * Spawn a new particle from the nozzle
   */
  private spawnParticle(baseScale: number, _maxScale: number): void {
    // Find inactive particle slot
    let slot = -1;
    for (let i = 0; i < this.particleCount; i++) {
      if (this.lifetimes[i] <= 0) {
        slot = i;
        break;
      }
    }
    if (slot === -1) return;

    const idx = slot * 3;

    // Position at nozzle with small offset along exhaust direction
    this.positions[idx] = this.nozzlePos.x + this.exhaustDir.x * 0.16;
    this.positions[idx + 1] = this.nozzlePos.y + this.exhaustDir.y * 0.16;
    this.positions[idx + 2] = this.nozzlePos.z + this.exhaustDir.z * 0.16;

    // Velocity: tight cone around exhaust direction (±14°)
    const coneAngle = this.coneAngle;
    const theta = Math.random() * coneAngle;
    const phi = Math.random() * Math.PI * 2;
    const speed = 1.2 + Math.random() * 0.8; // 1.2-2.0 units/sec

    const dirX = Math.sin(theta) * Math.cos(phi);
    const dirY = Math.sin(theta) * Math.sin(phi);
    const dirZ = Math.cos(theta);

    // Rotate to align with exhaustDir
    const exhaustNormalized = this.exhaustDir.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    if (Math.abs(exhaustNormalized.dot(up)) > 0.99) {
      up.set(1, 0, 0);
    }
    const right = new THREE.Vector3().crossVectors(up, exhaustNormalized).normalize();
    const forward = new THREE.Vector3().crossVectors(exhaustNormalized, right).normalize();

    const worldDir = new THREE.Vector3(
      dirX * right.x + dirY * up.x + dirZ * forward.x,
      dirX * right.y + dirY * up.y + dirZ * forward.y,
      dirX * right.z + dirY * up.z + dirZ * forward.z
    ).normalize();

    this.velocities[idx] = worldDir.x * speed;
    this.velocities[idx + 1] = worldDir.y * speed;
    this.velocities[idx + 2] = worldDir.z * speed;

    this.lifetimes[slot] = this.particleLifetime;
    this.maxLifetimes[slot] = this.particleLifetime;
    this.scales[slot] = baseScale;
    this.alphas[slot] = 0.85;
    this.activeCount++;
  }

  /**
   * Set visibility of the entire plume system
   */
  setVisible(visible: boolean): void {
    this.points.visible = visible;
    this.nozzleCore.visible = visible && this.emitting;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    (this.points.material as THREE.PointsMaterial).map?.dispose();
    (this.points.material as THREE.PointsMaterial).dispose();
    
    this.scene.remove(this.nozzleCore);
    this.nozzleCoreMaterial.map?.dispose();
    this.nozzleCoreMaterial.dispose();
    this.texture.dispose();
  }
}

export interface SceneSatellite {
  group: THREE.Group;
  body: SpaceBody;
  label: THREE.Sprite;
  beacon?: THREE.Sprite;
  orbit?: THREE.Line;
  blueVelArrow?: THREE.Mesh;
  greenAvoidArrow?: THREE.Mesh;
  thrusterPlume?: ThrusterPlume;
  lifecycle?: LifecycleState;
}

export interface SceneDebris {
  body: SpaceBody;
  index: number;
  color: THREE.Color;
  lifecycle?: LifecycleState;
}

export interface ActiveCollisionEffect {
  satIndex: number;
  debIndex: number;
  impactPos: THREE.Vector3;
  elapsed: number;
  totalDuration: number;
  flashMesh: THREE.Mesh;
  ringMesh: THREE.Mesh;
  shrapnelMesh: THREE.InstancedMesh;
  shrapnelVel: THREE.Vector3[];
  shrapnelRot: THREE.Vector3[];
  onComplete?: () => void;
}

export class SceneView {
  public canvas: HTMLCanvasElement;
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public sats: SceneSatellite[] = [];
  public debris: SceneDebris[] = [];
  public activeSats: number = 1;
  public activeDebris: number = 40;
  public earthGroup: THREE.Group;
  public satGroup: THREE.Group;
  public dynamic: THREE.Group;
  public arrowLayer: THREE.Group;
  public raycaster: THREE.Raycaster;
  public sunDir: THREE.Vector3 = new THREE.Vector3();
  public focusPoint: THREE.Vector3 = new THREE.Vector3();
  public focusDist: number = 26;
  public earthLightingMode: 'full-lit' | 'day-night' = 'full-lit';
  public sunLight!: THREE.DirectionalLight;
  public ambientLight!: THREE.AmbientLight;
  public hemiLight!: THREE.HemisphereLight;
  public earthMat!: THREE.MeshPhongMaterial;

  private earth!: THREE.Mesh;
  private clouds!: THREE.Mesh;
  private dotTex!: THREE.CanvasTexture;
  private koGroup!: THREE.Group;
  private koGlow!: THREE.Mesh;
  private ghost: THREE.Line | null = null;
  private crashLine: THREE.Line | null = null;
  private avoidLine: THREE.Line | null = null;
  private thrustArrow: THREE.ArrowHelper | null = null;
  private plume!: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  private linkLine!: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>;
  private threatRing!: THREE.Sprite;
  private debrisPoints: THREE.Points | null = null;
  private debrisArrowInstancedMesh: THREE.InstancedMesh | null = null;
  public debrisInstancedMesh: THREE.InstancedMesh | null = null;
  private activeCollisions: ActiveCollisionEffect[] = [];
  private selectedDebrisMesh: THREE.Mesh | null = null;
  private _lines: THREE.Line[] = [];
  private _plumeT?: number;
  private _tmp: THREE.Vector3 = new THREE.Vector3();
  private _tmpPos: THREE.Vector3 = new THREE.Vector3();
  private _tmpVel: THREE.Vector3 = new THREE.Vector3();
  private _tmpAvoid: THREE.Vector3 = new THREE.Vector3();
  private _isEco: boolean = false;

  // Debris Per-Instance State Arrays
  private _debScaleX: Float32Array = new Float32Array(0);
  private _debScaleY: Float32Array = new Float32Array(0);
  private _debScaleZ: Float32Array = new Float32Array(0);
  private _debRotX: Float32Array = new Float32Array(0);
  private _debRotY: Float32Array = new Float32Array(0);
  private _debRotZ: Float32Array = new Float32Array(0);
  private _debSpinX: Float32Array = new Float32Array(0);
  private _debSpinY: Float32Array = new Float32Array(0);
  private _debSpinZ: Float32Array = new Float32Array(0);
  private _debBaseColor: THREE.Color[] = [];

  // Dual-Path Smart Opacity Smoothing
  private _avoidPathOpacity: number = 0;
  private _avoidTargetOpacity: number = 0;

  // Hoisted scratch variables to eliminate GC pressure and per-frame allocations
  private _dummyMat: THREE.Matrix4 = new THREE.Matrix4();
  private _dummyPos: THREE.Vector3 = new THREE.Vector3();
  private _dummyQuat: THREE.Quaternion = new THREE.Quaternion();
  private _dummyScale: THREE.Vector3 = new THREE.Vector3();
  private _zeroScale: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  private _vScene: THREE.Vector3 = new THREE.Vector3();
  private _shrapnelP: THREE.Vector3 = new THREE.Vector3();
  private _shrapnelQ: THREE.Quaternion = new THREE.Quaternion();
  private _shrapnelS: THREE.Vector3 = new THREE.Vector3();
  private _deltaEuler: THREE.Euler = new THREE.Euler();
  private _deltaQ: THREE.Quaternion = new THREE.Quaternion();
  private _scratchEuler: THREE.Euler = new THREE.Euler();

  public onContextLost?: () => void;
  public onContextRestored?: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: (window.devicePixelRatio || 1) < 1.5,
      alpha: false,
      powerPreference: 'default',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050607);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 6000);
    this.camera.position.set(150, 90, 210);

    this.earthGroup = new THREE.Group();
    this.scene.add(this.earthGroup);
    this.satGroup = new THREE.Group();
    this.scene.add(this.satGroup);
    this.dynamic = new THREE.Group();
    this.scene.add(this.dynamic);
    this.arrowLayer = new THREE.Group();
    this.arrowLayer.name = 'arrowLayer';
    this.arrowLayer.position.set(0, 0, 0);
    this.arrowLayer.quaternion.identity();
    this.scene.add(this.arrowLayer);

    this._buildEnvironment();
    this._buildOverlays();
    this.raycaster = new THREE.Raycaster();

    this.canvas.addEventListener('webglcontextlost', (event: Event) => {
      event.preventDefault();
      console.warn('[WebGL] Context lost. Suspending renderer.');
      this.onContextLost?.();
    });

    this.canvas.addEventListener('webglcontextrestored', () => {
      console.info('[WebGL] Context restored. Re-initializing scene.');
      this.resize();
      this.onContextRestored?.();
    });
  }

  private _buildEnvironment(): void {
    const loader = new THREE.TextureLoader();
    const base = 'https://threejs.org/examples/textures/planets/';
    const proceduralEarthTex = createEarthFallbackTexture();
    const proceduralCloudTex = createCloudFallbackTexture();

    const geo = new THREE.SphereGeometry(63.71, 128, 96);
    const mat = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      map: proceduralEarthTex,
      normalScale: new THREE.Vector2(0.85, 0.85),
      shininess: 16,
      emissive: new THREE.Color(0x334455),
      emissiveIntensity: 0.5,
    });
    this.earthMat = mat;

    // Asynchronously enhance with high-resolution satellite imagery when available
    loader.load(
      base + 'earth_atmos_2048.jpg',
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        mat.map = t;
        mat.needsUpdate = true;
      },
      undefined,
      () => {}
    );
    loader.load(
      base + 'earth_normal_2048.jpg',
      (t) => {
        mat.normalMap = t;
        mat.needsUpdate = true;
      },
      undefined,
      () => {}
    );
    loader.load(
      base + 'earth_lights_2048.png',
      (t) => {
        mat.emissiveMap = t;
        mat.needsUpdate = true;
      },
      undefined,
      () => {}
    );

    this.earth = new THREE.Mesh(geo, mat);
    this.earthGroup.add(this.earth);

    const cloudMat = new THREE.MeshPhongMaterial({
      map: proceduralCloudTex,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    loader.load(
      base + 'earth_clouds_1024.png',
      (t) => {
        cloudMat.map = t;
        cloudMat.needsUpdate = true;
      },
      undefined,
      () => {}
    );
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(63.95, 96, 64), cloudMat);
    this.earthGroup.add(this.clouds);

    const atmoMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(0x3c7bff) } },
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vN; varying vec3 vV; uniform vec3 uColor; void main(){ float f=pow(1.0-abs(dot(vN,vV)),4.8); gl_FragColor=vec4(uColor,f*0.26); }`,
    });
    this.earthGroup.add(new THREE.Mesh(new THREE.SphereGeometry(65.6, 64, 48), atmoMat));

    const starGeo = new THREE.BufferGeometry();
    const N = 1200;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const rr = 900 + Math.random() * 900;
      const s = Math.sqrt(1 - u * u);
      pos.set([Math.cos(th) * s * rr, u * rr, Math.sin(th) * s * rr], i * 3);
      c.setHSL(0.55 + Math.random() * 0.09, 0.15 + Math.random() * 0.35, 0.6 + Math.random() * 0.4);
      col.set([c.r, c.g, c.b], i * 3);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.scene.add(
      new THREE.Points(
        starGeo,
        new THREE.PointsMaterial({
          size: 1.5,
          sizeAttenuation: false,
          vertexColors: true,
          transparent: true,
          opacity: 0.85,
        })
      )
    );

    this.sunDir = new THREE.Vector3(0.72, 0.42, 0.55).normalize();
    this.sunLight = new THREE.DirectionalLight(0xfff5e6, 1.8);
    this.sunLight.position.copy(this.sunDir).multiplyScalar(500);
    this.scene.add(this.sunLight);

    this.ambientLight = new THREE.AmbientLight(0xffffff, 2.2);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0xd0e8ff, 0x3a4a5a, 1.4);
    this.scene.add(this.hemiLight);

    // Default to Full Lit so the Earth is immediately visible and radiant everywhere
    this.setEarthLighting('full-lit');

    const sunSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radialTex(
          [
            [0, 'rgba(255,250,235,1)'],
            [0.25, 'rgba(255,210,150,.55)'],
            [1, 'rgba(255,120,0,0)'],
          ],
          128
        ),
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      })
    );
    sunSprite.position.copy(this.sunDir).multiplyScalar(1400);
    sunSprite.scale.setScalar(180);
    this.scene.add(sunSprite);
  }

  private _buildOverlays(): void {
    this.dotTex = radialTex(
      [
        [0, 'rgba(255,255,255,1)'],
        [0.35, 'rgba(255,255,255,.9)'],
        [1, 'rgba(255,255,255,0)'],
      ],
      48
    );
    this.koGroup = new THREE.Group();
    this.dynamic.add(this.koGroup);
    const wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 16, 10)),
      new THREE.LineBasicMaterial({ color: COL.sat, transparent: true, opacity: 0.16, depthWrite: false })
    );
    this.koGroup.add(wire);
    this.koGlow = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 24),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color(COL.sat) } },
        vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
        fragmentShader: `varying vec3 vN; varying vec3 vV; uniform vec3 uColor; void main(){ float f=pow(1.0-abs(dot(vN,vV)),2.0); gl_FragColor=vec4(uColor,f*0.18); }`,
      })
    );
    this.koGroup.add(this.koGlow);

    this.plume = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.9, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffd08a,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    this.dynamic.add(this.plume);

    this.linkLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({
        color: COL.crit,
        dashSize: 0.7,
        gapSize: 0.5,
        transparent: true,
        opacity: 0.7,
      })
    );
    this.linkLine.visible = false;
    this.dynamic.add(this.linkLine);

    this.threatRing = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: ringTex(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.threatRing.scale.setScalar(2.2);
    this.threatRing.visible = false;
    this.dynamic.add(this.threatRing);
  }

  public build(
    satBodies: SpaceBody[],
    debrisBodies: SpaceBody[],
    stateAtFunc: (body: SpaceBody, t: number) => StateVector | null,
    t0: number
  ): void {
    while (this.satGroup.children.length) {
      const child = this.satGroup.children[0];
      this._disposeHierarchy(child);
      this.satGroup.remove(child);
    }
    for (const l of this._lines || []) {
      this.dynamic.remove(l);
      l.geometry.dispose();
    }
    this._lines = [];
    if (this.debrisInstancedMesh) {
      this.dynamic.remove(this.debrisInstancedMesh);
      this.debrisInstancedMesh.geometry.dispose();
      (this.debrisInstancedMesh.material as THREE.Material).dispose();
      this.debrisInstancedMesh = null;
    }
    if (this.debrisPoints) {
      this.dynamic.remove(this.debrisPoints);
      this.debrisPoints.geometry.dispose();
      this.debrisPoints = null;
    }
    if (this.debrisArrowInstancedMesh) {
      this.dynamic.remove(this.debrisArrowInstancedMesh);
      this.debrisArrowInstancedMesh.geometry.dispose();
      this.debrisArrowInstancedMesh = null;
    }
    for (const col of this.activeCollisions) {
      this.dynamic.remove(col.flashMesh);
      col.flashMesh.geometry.dispose();
      this.dynamic.remove(col.ringMesh);
      col.ringMesh.geometry.dispose();
      this.dynamic.remove(col.shrapnelMesh);
      col.shrapnelMesh.geometry.dispose();
    }
    this.activeCollisions = [];
    this.sats.forEach(s => {
      if (s.blueVelArrow) {
        this.arrowLayer.remove(s.blueVelArrow);
        s.blueVelArrow.geometry.dispose();
      }
      if (s.greenAvoidArrow) {
        this.arrowLayer.remove(s.greenAvoidArrow);
        s.greenAvoidArrow.geometry.dispose();
      }
    });
    if (this.ghost) {
      this.dynamic.remove(this.ghost);
      this.ghost.geometry.dispose();
      this.ghost = null;
    }
    this.clearDualPaths();

    this.sats = [];
    this.debris = [];

    const busMat = new THREE.MeshStandardMaterial({
      color: 0xe2ded4,
      metalness: 0.82,
      roughness: 0.28,
    });
    const mliMat = new THREE.MeshStandardMaterial({
      color: 0xd4a017,
      metalness: 0.88,
      roughness: 0.32,
    });
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x0f1c3f,
      metalness: 0.9,
      roughness: 0.22,
      emissive: 0x08152e,
      emissiveIntensity: 0.5,
    });
    const yokeMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.8,
      roughness: 0.35,
    });
    const dishMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.72,
      roughness: 0.28,
    });
    const lensMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a8a,
      metalness: 0.95,
      roughness: 0.1,
      emissive: 0x0c4a6e,
      emissiveIntensity: 0.45,
    });

    satBodies.forEach((b, i) => {
      const g = new THREE.Group();

      // 1. Main Spacecraft Bus
      const bus = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.32, 0.32), busMat);
      g.add(bus);

      // 2. Gold MLI Thermal Blanketing Panels
      const mli = new THREE.Mesh(new THREE.BoxGeometry(0.385, 0.22, 0.22), mliMat);
      g.add(mli);

      // 3. Nadir Optical Sensor / Telescope (Earth facing)
      const nadirTube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.24, 16), busMat);
      nadirTube.rotation.x = Math.PI / 2;
      nadirTube.position.z = 0.22;
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.085, 16), lensMat);
      lens.position.z = 0.341;
      g.add(nadirTube, lens);

      // 4. High-Gain Parabolic Communications Dish & Feed Horn
      const dish = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.14, 16, 1, true), dishMat);
      dish.rotation.x = -Math.PI / 2;
      dish.position.set(0, 0.24, -0.12);
      const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.14), busMat);
      feed.rotation.x = -Math.PI / 2;
      feed.position.set(0, 0.24, -0.05);
      g.add(dish, feed);

      // 5. Articulated Solar Array Wings with Structural Yokes
      const yokeL = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.18), yokeMat);
      yokeL.rotation.z = Math.PI / 2;
      yokeL.position.x = -0.28;
      const pL = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.018, 0.34), panelMat);
      pL.position.x = -0.72;

      const yokeR = yokeL.clone();
      yokeR.position.x = 0.28;
      const pR = pL.clone();
      pR.position.x = 0.72;
      g.add(yokeL, pL, yokeR, pR);

      // 6. 4-Corner RCS Thruster Pods
      const rcsPositions = [
        [-0.18, -0.15, -0.15],
        [0.18, -0.15, -0.15],
        [-0.18, 0.15, -0.15],
        [0.18, 0.15, -0.15],
      ];
      rcsPositions.forEach(([rx, ry, rz]) => {
        const rcs = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.06, 8), yokeMat);
        rcs.position.set(rx, ry, rz);
        g.add(rcs);
      });

      const beacon = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.dotTex,
          color: COL.sat,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
        })
      );
      beacon.scale.setScalar(1.1);
      g.add(beacon);

      const lab = labelSprite(b.name.length > 16 ? b.name.slice(0, 16) : b.name, '#ff7a3c');
      lab.position.set(0, 0.75, 0);
      g.add(lab);
      g.userData = { index: i, kind: 'sat' };
      this.satGroup.add(g);

      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 180; k++) {
        const st = stateAtFunc(b, t0 + (b.period * 1000 * k) / 180);
        if (st) pts.push(toScene(st.r));
      }
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(
        lineGeo,
        new THREE.LineBasicMaterial({
          color: 0x3b82f6,
          transparent: true,
          opacity: i === 0 ? 0.65 : 0.35,
          depthWrite: false,
        })
      );
      line.userData = { index: i, kind: 'sat-orbit' };
      this.dynamic.add(line);
      this._lines.push(line);

      const arrowGeo = createArrowGeometry();
      const blueVelArrow = new THREE.Mesh(
        arrowGeo,
        new THREE.MeshStandardMaterial({
          color: 0x3b82f6,
          emissive: 0x1d4ed8,
          emissiveIntensity: 0.65,
          roughness: 0.3,
          metalness: 0.5,
        })
      );
      blueVelArrow.frustumCulled = false;
      this.arrowLayer.add(blueVelArrow);

      const avoidGeo = createArrowGeometry();
      const greenAvoidArrow = new THREE.Mesh(
        avoidGeo,
        new THREE.MeshStandardMaterial({
          color: COL.neonGreen,
          emissive: COL.neonGreenEmissive,
          emissiveIntensity: 0.85,
          roughness: 0.25,
          metalness: 0.4,
        })
      );
      greenAvoidArrow.visible = false;
      greenAvoidArrow.frustumCulled = false;
      this.arrowLayer.add(greenAvoidArrow);

      // Initialize ThrusterPlume for this satellite
      const thrusterPlume = new ThrusterPlume(this.scene);

      this.sats.push({
        group: g,
        body: b,
        label: lab,
        beacon,
        orbit: line,
        blueVelArrow,
        greenAvoidArrow,
        thrusterPlume,
        lifecycle: b.lifecycle || 'ACTIVE',
      });
    });

    // 7. Organic Craggy 3D Space Debris (Single Unified InstancedMesh, Seeded & Deterministic)
    const cap = debrisBodies.length;
    this._debScaleX = new Float32Array(cap);
    this._debScaleY = new Float32Array(cap);
    this._debScaleZ = new Float32Array(cap);
    this._debRotX = new Float32Array(cap);
    this._debRotY = new Float32Array(cap);
    this._debRotZ = new Float32Array(cap);
    this._debSpinX = new Float32Array(cap);
    this._debSpinY = new Float32Array(cap);
    this._debSpinZ = new Float32Array(cap);
    this._debBaseColor = [];

    const prng = new Mulberry32(1337);

    for (let i = 0; i < cap; i++) {
      // Natural non-uniform scale: base uniform s in [0.70, 1.40] with axis jitter +-12%
      const baseS = prng.range(0.70, 1.40);
      this._debScaleX[i] = baseS * (1.0 + prng.range(-0.12, 0.12));
      this._debScaleY[i] = baseS * (1.0 + prng.range(-0.12, 0.12));
      this._debScaleZ[i] = baseS * (1.0 + prng.range(-0.12, 0.12));

      this._debRotX[i] = prng.range(0, Math.PI * 2);
      this._debRotY[i] = prng.range(0, Math.PI * 2);
      this._debRotZ[i] = prng.range(0, Math.PI * 2);

      // Calm, realistic zero-G tumble spin: [-0.65, +0.65] rad/s per axis
      this._debSpinX[i] = prng.range(-0.65, 0.65);
      this._debSpinY[i] = prng.range(-0.65, 0.65);
      this._debSpinZ[i] = prng.range(-0.65, 0.65);

      const colHex = DEBRIS_PALETTE[Math.floor(prng.next() * DEBRIS_PALETTE.length)];
      this._debBaseColor[i] = new THREE.Color(colHex);
    }

    const debrisGeo = createCraggyDebrisGeometry();
    const debrisMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.72,
      roughness: 0.48,
      flatShading: true,
    });

    this.debrisInstancedMesh = new THREE.InstancedMesh(debrisGeo, debrisMat, cap);
    this.debrisInstancedMesh.frustumCulled = false;
    for (let i = 0; i < cap; i++) {
      this.debrisInstancedMesh.setColorAt(i, this._debBaseColor[i]);
    }
    if (this.debrisInstancedMesh.instanceColor) {
      this.debrisInstancedMesh.instanceColor.needsUpdate = true;
    }
    this.dynamic.add(this.debrisInstancedMesh);

    const debArrowGeo = createArrowGeometry();
    const debArrowMat = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });
    this.debrisArrowInstancedMesh = new THREE.InstancedMesh(debArrowGeo, debArrowMat, cap);
    this.debrisArrowInstancedMesh.frustumCulled = false;
    this.dynamic.add(this.debrisArrowInstancedMesh);

    this.debris = debrisBodies.map((b, i) => ({ body: b, index: i, color: this._debBaseColor[i] }));
  }

  public update({
    sats,
    debris,
    gmstAngle,
    threatIdx: _threatIdx = -1,
    threatPos = null,
    selected = null,
    burnPath = null,
    debrisUpdated: _debrisUpdated = true,
    dtReal = 0.016,
    satVelocities = [],
    debrisVelocities = [],
    avoidanceVec = null,
    avoidanceVisible = false,
    satLifecycles = [],
    satTangents = [],
    debrisTangents = [],
  }: {
    sats: (StateVector | null)[];
    debris: (number[] | null)[];
    ts?: number;
    gmstAngle: number;
    threatIdx?: number;
    threatPos?: number[] | null;
    selected?: { sat?: number; kind?: string; index?: number } | null;
    burnPath?: number[][] | null;
    debrisUpdated?: boolean;
    dtReal?: number;
    satVelocities?: (number[] | null)[];
    debrisVelocities?: (number[] | null)[];
    avoidanceVec?: [number, number, number] | null;
    avoidanceVisible?: boolean;
    satLifecycles?: (LifecycleState | undefined)[];
    satTangents?: (THREE.Vector3 | [number, number, number] | null)[];
    debrisTangents?: (THREE.Vector3 | [number, number, number] | null)[];
  }): void {
    sats.forEach((st, i) => {
      const s = this.sats[i];
      if (!s || !st) return;
      const p = (st as any)?.rScene
        ? this._tmpPos.set((st as any).rScene[0], (st as any).rScene[1], (st as any).rScene[2])
        : toScene(st.r);
      s.group.position.copy(p);
      const dir = this._tmp.copy(toScene(st.v)).sub(p);
      if (dir.lengthSq() > 1e-6) s.group.lookAt(p.clone().add(dir));

      const lifecycle = satLifecycles[i] || s.lifecycle || 'ACTIVE';
      s.lifecycle = lifecycle;

      const isDestroyed = lifecycle === 'DESTROYED' || lifecycle === 'REMOVED';
      const isVisible = i < this.activeSats && !isDestroyed;
      s.group.visible = isVisible;
      if (s.orbit) s.orbit.visible = isVisible;

      if (isDestroyed) {
        if (s.blueVelArrow) s.blueVelArrow.visible = false;
        if (s.greenAvoidArrow) s.greenAvoidArrow.visible = false;
        if (s.beacon) s.beacon.visible = false;
        if (s.label) s.label.visible = false;
        return;
      }

      // Dynamic Beacon Cross-Fade: smooth fade-out as camera enters micro-inspection range
      const camDist = this.camera.position.distanceTo(p);
      const alpha = THREE.MathUtils.clamp((camDist - 2.5) / 9.5, 0.0, 0.95);
      if (s.beacon) (s.beacon.material as THREE.SpriteMaterial).opacity = alpha;
      if (s.label) (s.label.material as THREE.SpriteMaterial).opacity = THREE.MathUtils.clamp((camDist - 3.5) / 8.0, 0.0, 0.95);

      const arrowScale = THREE.MathUtils.clamp(camDist * 0.065, 0.22, 2.4);

      // 1. Blue Default Velocity Arrow (Oriented along exact world scene orbit tangent)
      if (s.blueVelArrow) {
        let tanBlue: THREE.Vector3 | null = null;
        if (satTangents && satTangents[i]) {
          const tRaw = satTangents[i]!;
          tanBlue = Array.isArray(tRaw)
            ? this._tmpVel.set(tRaw[0], tRaw[1], tRaw[2]).normalize()
            : (tRaw as THREE.Vector3).clone().normalize();
        } else if (satVelocities && satVelocities[i]) {
          const v = satVelocities[i]!;
          tanBlue = this._tmpVel.set(v[0] * KM, v[2] * KM, -v[1] * KM).normalize();
        }

        if (isVisible && tanBlue && tanBlue.lengthSq() > 1e-4) {
          s.blueVelArrow.position.copy(p).addScaledVector(tanBlue, 0.22);
          s.blueVelArrow.quaternion.setFromUnitVectors(UP, tanBlue);
          s.blueVelArrow.scale.set(arrowScale, arrowScale, arrowScale);
          const isTargetSat = (selected?.sat ?? 0) === i;
          const isDodgeActive = isTargetSat && avoidanceVisible && this._avoidPathOpacity > 0.01;
          (s.blueVelArrow.material as THREE.MeshStandardMaterial).opacity = isDodgeActive ? 0.35 : 1.0;
          s.blueVelArrow.visible = true;
        } else {
          s.blueVelArrow.visible = false;
        }
      }

      // 2. Green Avoidance Maneuver Arrow (Exact tangent of the green avoidance curve)
      if (s.greenAvoidArrow) {
        const isTargetSat = (selected?.sat ?? 0) === i;
        if (isVisible && isTargetSat && avoidanceVisible && avoidanceVec && this._avoidPathOpacity > 0.01) {
          const aScene = this._tmpAvoid.set(avoidanceVec[0], avoidanceVec[1], avoidanceVec[2]).normalize();
          s.greenAvoidArrow.position.copy(p).addScaledVector(aScene, 0.22);
          s.greenAvoidArrow.quaternion.setFromUnitVectors(UP, aScene);
          const greenScale = arrowScale * 1.2;
          s.greenAvoidArrow.scale.set(greenScale, greenScale, greenScale);
          (s.greenAvoidArrow.material as THREE.MeshStandardMaterial).opacity = this._avoidPathOpacity;
          s.greenAvoidArrow.visible = true;
        } else {
          s.greenAvoidArrow.visible = false;
        }
      }
    });

    // Smooth opacity transition for avoidance path line and green avoidance arrow
    this._avoidTargetOpacity = avoidanceVisible ? 0.95 : 0.0;
    this._avoidPathOpacity += (this._avoidTargetOpacity - this._avoidPathOpacity) * Math.min(1.0, dtReal * 5.0);
    if (this.avoidLine) {
      (this.avoidLine.material as THREE.LineBasicMaterial).opacity = this._avoidPathOpacity;
      this.avoidLine.visible = this._avoidPathOpacity > 0.01;
    }

    if (this.earthGroup) this.earthGroup.rotation.y = gmstAngle;

    if (this.thrustArrow) {
      const activeSatIdx = selected?.sat ?? 0;
      if (this.sats[activeSatIdx]) {
        this.thrustArrow.position.copy(this.sats[activeSatIdx].group.position);
        const camDist = this.camera.position.distanceTo(this.thrustArrow.position);
        const scale = THREE.MathUtils.clamp(camDist * 0.12, 0.18, 1.35);
        this.thrustArrow.setLength(2.4 * scale, 0.7 * scale, 0.4 * scale);
      }
    }

    // Faceted 3D Debris Inspection Model
    if (this.selectedDebrisMesh) {
      let debPos: number[] | null = null;
      if (selected?.kind === 'deb' && typeof selected.index === 'number') {
        debPos = debris[selected.index] || null;
      } else if (threatPos) {
        debPos = threatPos;
      }
      if (debPos) {
        const dp = toScene(debPos);
        this.selectedDebrisMesh.position.copy(dp);
        this.selectedDebrisMesh.rotation.x += 0.008;
        this.selectedDebrisMesh.rotation.y += 0.012;
        this.selectedDebrisMesh.visible = true;
      } else {
        this.selectedDebrisMesh.visible = false;
      }
    }

    // Update Organic Craggy 3D Space Debris (1 InstancedMesh draw call, zero allocations)
    if (this.debrisInstancedMesh) {
      const maxDeb = Math.min(this.activeDebris, debris.length);
      const cap = this._debScaleX.length;

      for (let i = 0; i < cap; i++) {
        const pKm = debris[i];
        if (i < maxDeb && pKm) {
          // Advance calm, realistic zero-G tumble
          this._debRotX[i] += this._debSpinX[i] * dtReal;
          this._debRotY[i] += this._debSpinY[i] * dtReal;
          this._debRotZ[i] += this._debSpinZ[i] * dtReal;

          this._scratchEuler.set(this._debRotX[i], this._debRotY[i], this._debRotZ[i]);
          this._dummyQuat.setFromEuler(this._scratchEuler);
          this._dummyPos.set(pKm[0] * KM, pKm[2] * KM, -pKm[1] * KM);
          this._dummyScale.set(this._debScaleX[i], this._debScaleY[i], this._debScaleZ[i]);
          this._dummyMat.compose(this._dummyPos, this._dummyQuat, this._dummyScale);
          this.debrisInstancedMesh.setMatrixAt(i, this._dummyMat);
        } else {
          this._dummyMat.compose(this._dummyPos, this._dummyQuat, this._zeroScale);
          this.debrisInstancedMesh.setMatrixAt(i, this._dummyMat);
        }
      }
      this.debrisInstancedMesh.instanceMatrix.needsUpdate = true;
    }

    // Debris Velocity Arrows Instanced Rendering (World-space central difference tangents, 1 draw call)
    if (this.debrisArrowInstancedMesh) {
      const maxDeb = Math.min(this.activeDebris, debris.length);
      for (let i = 0; i < this.debris.length; i++) {
        const pKm = debris[i];
        if (i < maxDeb && pKm) {
          this._dummyPos.set(pKm[0] * KM, pKm[2] * KM, -pKm[1] * KM);
          let tanDeb: THREE.Vector3 | null = null;
          if (debrisTangents && debrisTangents[i]) {
            const tRaw = debrisTangents[i]!;
            tanDeb = Array.isArray(tRaw)
              ? this._vScene.set(tRaw[0], tRaw[1], tRaw[2]).normalize()
              : (tRaw as THREE.Vector3).clone().normalize();
          } else if (debrisVelocities && debrisVelocities[i]) {
            const vKm = debrisVelocities[i]!;
            tanDeb = this._vScene.set(vKm[0] * KM, vKm[2] * KM, -vKm[1] * KM).normalize();
          }

          if (tanDeb && tanDeb.lengthSq() > 1e-4) {
            this._dummyQuat.setFromUnitVectors(UP, tanDeb);
            this._dummyPos.addScaledVector(tanDeb, 0.12);
            this._dummyScale.set(0.42, 0.42, 0.42);
            this._dummyMat.compose(this._dummyPos, this._dummyQuat, this._dummyScale);
          } else {
            this._dummyMat.compose(this._dummyPos, this._dummyQuat, this._zeroScale);
          }
        } else {
          this._dummyMat.compose(this._dummyPos, this._dummyQuat, this._zeroScale);
        }
        this.debrisArrowInstancedMesh.setMatrixAt(i, this._dummyMat);
      }
      this.debrisArrowInstancedMesh.instanceMatrix.needsUpdate = true;
    }

    // Animate Active Collisions & Smooth Dissolution (zero-allocation)
    if (this.activeCollisions.length > 0) {
      const remaining: ActiveCollisionEffect[] = [];

      for (const col of this.activeCollisions) {
        col.elapsed += dtReal;
        const u = Math.min(1.0, col.elapsed / col.totalDuration);

        // Core flash: expands and fades in first 0.25s
        const flashU = Math.min(1.0, col.elapsed / 0.25);
        col.flashMesh.scale.setScalar(1.0 + flashU * 3.5);
        (col.flashMesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1.0 - flashU);

        // Shockwave ring: expands and fades over 0.8s
        const ringU = Math.min(1.0, col.elapsed / 0.8);
        col.ringMesh.scale.setScalar(1.0 + ringU * 10.0);
        col.ringMesh.lookAt(this.camera.position);
        (col.ringMesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.95 * (1.0 - ringU));

        // Shrapnel particles: expand radially with velocity decay and tumble
        const shrapnelCount = col.shrapnelVel.length;
        const particleScale = Math.max(0.01, (1.0 - u) * 0.08);
        for (let k = 0; k < shrapnelCount; k++) {
          const vel = col.shrapnelVel[k];
          vel.multiplyScalar(0.96);
          const rot = col.shrapnelRot[k];
          col.shrapnelMesh.getMatrixAt(k, this._dummyMat);
          this._dummyMat.decompose(this._shrapnelP, this._shrapnelQ, this._shrapnelS);
          this._shrapnelP.addScaledVector(vel, dtReal);
          this._deltaEuler.set(rot.x * dtReal, rot.y * dtReal, rot.z * dtReal);
          this._deltaQ.setFromEuler(this._deltaEuler);
          this._shrapnelQ.multiply(this._deltaQ);
          this._shrapnelS.setScalar(particleScale);
          this._dummyMat.compose(this._shrapnelP, this._shrapnelQ, this._shrapnelS);
          col.shrapnelMesh.setMatrixAt(k, this._dummyMat);
        }
        col.shrapnelMesh.instanceMatrix.needsUpdate = true;
        (col.shrapnelMesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1.0 - u);

        // Satellite dissolution: fade opacity 1 -> 0, shrink scale 1 -> 0.05
        const satObj = this.sats[col.satIndex];
        if (satObj) {
          const satScale = Math.max(0.05, 1.0 - u);
          satObj.group.scale.setScalar(satScale);
          satObj.group.traverse(child => {
            if ((child as THREE.Mesh).isMesh) {
              const m = (child as THREE.Mesh).material as THREE.Material;
              if (m) {
                m.transparent = true;
                m.opacity = Math.max(0, 1.0 - u);
              }
            }
          });
          if (satObj.orbit) {
            (satObj.orbit.material as THREE.LineBasicMaterial).opacity = Math.max(0, 0.5 * (1.0 - u));
          }
          if (satObj.blueVelArrow) {
            satObj.blueVelArrow.scale.multiplyScalar(satScale);
          }
        }

        // Debris dissolution: if selectedDebrisMesh is at this debris, shrink and fade it
        if (this.selectedDebrisMesh && this.selectedDebrisMesh.visible) {
          this.selectedDebrisMesh.scale.setScalar(Math.max(0.05, 1.0 - u));
          (this.selectedDebrisMesh.material as THREE.MeshStandardMaterial).opacity = Math.max(0, 1.0 - u);
        }

        if (u >= 1.0) {
          this.dynamic.remove(col.flashMesh);
          col.flashMesh.geometry.dispose();
          this.dynamic.remove(col.ringMesh);
          col.ringMesh.geometry.dispose();
          this.dynamic.remove(col.shrapnelMesh);
          col.shrapnelMesh.geometry.dispose();

          if (satObj) {
            satObj.lifecycle = 'DESTROYED';
            satObj.group.visible = false;
            if (satObj.orbit) satObj.orbit.visible = false;
            if (satObj.blueVelArrow) satObj.blueVelArrow.visible = false;
            if (satObj.greenAvoidArrow) satObj.greenAvoidArrow.visible = false;
            if (satObj.beacon) satObj.beacon.visible = false;
            if (satObj.label) satObj.label.visible = false;
          }
          if (this.selectedDebrisMesh) {
            this.selectedDebrisMesh.visible = false;
          }
          if (this.threatRing) {
            this.threatRing.visible = false;
          }
          if (this.crashLine) {
            this.crashLine.visible = false;
          }
          if (this.avoidLine) {
            this.avoidLine.visible = false;
          }

          col.onComplete?.();
        } else {
          remaining.push(col);
        }
      }
      this.activeCollisions = remaining;
    }

    const sat = this.sats[Math.max(0, Math.min(this.sats.length - 1, selected?.sat ?? 0))];
    if (sat && sat.group.visible) {
      this.koGroup.visible = true;
      this.koGroup.position.copy(sat.group.position);
      this.koGroup.scale.setScalar(SAFE_UNIT);
    } else {
      this.koGroup.visible = false;
    }

    if (threatPos) {
      const p = toScene(threatPos);
      this.threatRing.visible = true;
      this.threatRing.position.copy(p);
      this.linkLine.visible = false; // Never draw Earth-piercing connector chord
    } else {
      this.threatRing.visible = false;
      this.linkLine.visible = false;
    }

    if (burnPath) this._setGhost(burnPath);
    if (this._plumeT !== undefined) {
      this._plumeT -= 1 / 60;
      this.plume.material.opacity = Math.max(0, this._plumeT);
      this.plume.scale.setScalar(1 + (1 - Math.max(0, this._plumeT)) * 1.6);
      if (this._plumeT <= 0) this._plumeT = undefined;
    }
  }

  private _setGhost(points: number[][]): void {
    if (this.ghost) {
      this.dynamic.remove(this.ghost);
      this.ghost.geometry.dispose();
      this.ghost = null;
    }
    this.clearDualPaths();
    if (!points || points.length < 2) return;
    const ok = points.filter(p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite));
    if (ok.length < 2) return;
    const g = new THREE.BufferGeometry().setFromPoints(ok.map(toScene));
    this.ghost = new THREE.Line(
      g,
      new THREE.LineDashedMaterial({
        color: 0xffc24b,
        dashSize: 1.2,
        gapSize: 0.8,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      })
    );
    this.ghost.computeLineDistances();
    this.dynamic.add(this.ghost);
  }

  public setDualPaths(
    crashPts: [number, number, number][] | number[][] | null,
    avoidPts: [number, number, number][] | number[][] | null,
    thrustVector?: [number, number, number] | null,
    satIndex: number = 0
  ): void {
    const toVec = (p: number[]): THREE.Vector3 => {
      const mag = Math.hypot(p[0], p[1], p[2]);
      return mag < 2000 ? new THREE.Vector3(p[0], p[1], p[2]) : toScene(p);
    };

    // 1. Abandoned Default Trajectory (Dashed Crimson/Red Line #EF4444 - "Crash if Untouched")
    if (this.crashLine) {
      this.dynamic.remove(this.crashLine);
      this.crashLine.geometry.dispose();
      this.crashLine = null;
    }
    if (crashPts && crashPts.length >= 2) {
      const ok = crashPts.filter(p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite));
      if (ok.length >= 2) {
        const pts = ok.map(toVec);
        const g = new THREE.BufferGeometry().setFromPoints(pts);
        this.crashLine = new THREE.Line(
          g,
          new THREE.LineDashedMaterial({
            color: 0xEF4444, // Crimson red for crash path
            dashSize: 0.8,
            gapSize: 0.5,
            transparent: true,
            opacity: 0.65,
            depthWrite: false,
          })
        );
        this.crashLine.computeLineDistances();
        this.dynamic.add(this.crashLine);
      }
    }

    // 2. Engine 2 Avoidance Path (Solid Glowing Neon Leafy Green Line #34E858 - "Safe AI Bypass")
    if (this.avoidLine) {
      this.dynamic.remove(this.avoidLine);
      this.avoidLine.geometry.dispose();
      this.avoidLine = null;
    }
    if (avoidPts && avoidPts.length >= 2) {
      const ok = avoidPts.filter(p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite));
      if (ok.length >= 2) {
        const pts = ok.map(toVec);
        const g = new THREE.BufferGeometry().setFromPoints(pts);
        this.avoidLine = new THREE.Line(
          g,
          new THREE.LineBasicMaterial({
            color: COL.neonGreen, // Neon leafy green
            transparent: true,
            opacity: this._avoidPathOpacity,
            depthWrite: false,
          })
        );
        this.avoidLine.visible = this._avoidPathOpacity > 0.01;
        this.dynamic.add(this.avoidLine);
      }
    }

    // 3. 3D Thrust Direction Arrow Helper on the Satellite (Neon Green)
    if (this.thrustArrow) {
      this.dynamic.remove(this.thrustArrow);
      this.thrustArrow.dispose();
      this.thrustArrow = null;
    }
    if (thrustVector && this.sats[satIndex]) {
      const satPos = this.sats[satIndex].group.position;
      const tScene = toScene(thrustVector).normalize();
      if (tScene.lengthSq() > 0.01) {
        this.thrustArrow = new THREE.ArrowHelper(
          tScene,
          satPos,
          2.6,
          COL.neonGreen,
          0.8,
          0.45
        );
        this.dynamic.add(this.thrustArrow);
        
        // Update thruster plume exhaust direction (opposite to thrust per Newton's 3rd Law)
        const s = this.sats[satIndex];
        if (s && s.thrusterPlume) {
          s.thrusterPlume.setExhaustDirection(tScene, satPos);
        }
      }
    }
  }

  public clearDualPaths(): void {
    if (this.crashLine) {
      this.dynamic.remove(this.crashLine);
      this.crashLine.geometry.dispose();
      this.crashLine = null;
    }
    if (this.avoidLine) {
      this.dynamic.remove(this.avoidLine);
      this.avoidLine.geometry.dispose();
      this.avoidLine = null;
    }
    if (this.thrustArrow) {
      this.dynamic.remove(this.thrustArrow);
      this.thrustArrow.dispose();
      this.thrustArrow = null;
    }
    if (this.ghost) {
      this.dynamic.remove(this.ghost);
      this.ghost.geometry.dispose();
      this.ghost = null;
    }
  }

  public triggerCollisionEffect(
    impactPosKm: [number, number, number],
    satIndex: number,
    debIndex: number,
    onComplete?: () => void
  ): void {
    const impactScenePos = toScene(impactPosKm);

    // 1. Incandescent Core Flash Sphere
    const flashGeo = new THREE.SphereGeometry(0.6, 16, 16);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const flashMesh = new THREE.Mesh(flashGeo, flashMat);
    flashMesh.position.copy(impactScenePos);
    this.dynamic.add(flashMesh);

    // 2. Expanding Shockwave Ring
    const ringGeo = new THREE.RingGeometry(0.2, 0.6, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff5511,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.copy(impactScenePos);
    ringMesh.lookAt(this.camera.position);
    this.dynamic.add(ringMesh);

    // 3. 64 Tumbling Metallic / Ember Shrapnel Particles
    const shrapnelGeo = new THREE.TetrahedronGeometry(0.08);
    const shrapnelMat = new THREE.MeshBasicMaterial({
      color: 0xffa500,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const count = 64;
    const shrapnelMesh = new THREE.InstancedMesh(shrapnelGeo, shrapnelMat, count);
    shrapnelMesh.frustumCulled = false;
    const shrapnelVel: THREE.Vector3[] = [];
    const shrapnelRot: THREE.Vector3[] = [];
    const dummy = new THREE.Matrix4();
    const pos = impactScenePos;

    for (let k = 0; k < count; k++) {
      dummy.setPosition(pos);
      shrapnelMesh.setMatrixAt(k, dummy);
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      const speed = 1.2 + Math.random() * 3.8;
      shrapnelVel.push(new THREE.Vector3(Math.cos(th) * s * speed, u * speed, Math.sin(th) * s * speed));
      shrapnelRot.push(new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8));
    }
    shrapnelMesh.instanceMatrix.needsUpdate = true;
    this.dynamic.add(shrapnelMesh);

    this.activeCollisions.push({
      satIndex,
      debIndex,
      impactPos: impactScenePos,
      elapsed: 0,
      totalDuration: 1.2,
      flashMesh,
      ringMesh,
      shrapnelMesh,
      shrapnelVel,
      shrapnelRot,
      onComplete,
    });
  }

  public setEarthLighting(mode: 'full-lit' | 'day-night'): void {
    this.earthLightingMode = mode;
    if (mode === 'full-lit') {
      if (this.ambientLight) {
        this.ambientLight.intensity = 2.4;
        this.ambientLight.color.setHex(0xffffff);
      }
      if (this.hemiLight) {
        this.hemiLight.intensity = 1.4;
      }
      if (this.sunLight) {
        this.sunLight.intensity = 1.8;
      }
      if (this.earthMat) {
        this.earthMat.shininess = 6;
        this.earthMat.emissive.setHex(0x556677);
        this.earthMat.emissiveIntensity = 0.55;
      }
    } else {
      // Realistic Day / Night lighting
      if (this.ambientLight) {
        this.ambientLight.intensity = 0.22;
        this.ambientLight.color.setHex(0x1a2638);
      }
      if (this.hemiLight) {
        this.hemiLight.intensity = 0.35;
      }
      if (this.sunLight) {
        this.sunLight.intensity = 2.8;
      }
      if (this.earthMat) {
        this.earthMat.shininess = 25;
        this.earthMat.emissive.setHex(0x0a101d);
        this.earthMat.emissiveIntensity = 0.15;
      }
    }
  }

  public purgeDebris(index: number): void {
    const d = this.debris[index];
    if (d && d.body) {
      d.body.lifecycle = 'REMOVED';
    }
    if (this.debrisInstancedMesh) {
      this._dummyMat.compose(this._dummyPos, this._dummyQuat, this._zeroScale);
      this.debrisInstancedMesh.setMatrixAt(index, this._dummyMat);
      this.debrisInstancedMesh.instanceMatrix.needsUpdate = true;
    }
    if (this.debrisArrowInstancedMesh) {
      this._dummyMat.compose(this._dummyPos, this._dummyQuat, this._zeroScale);
      this.debrisArrowInstancedMesh.setMatrixAt(index, this._dummyMat);
      this.debrisArrowInstancedMesh.instanceMatrix.needsUpdate = true;
    }
    if (this.selectedDebrisMesh && this.selectedDebrisMesh.visible) {
      this.selectedDebrisMesh.visible = false;
    }
    if (this.threatRing && this.threatRing.visible) {
      this.threatRing.visible = false;
    }
    if (this.linkLine && this.linkLine.visible) {
      this.linkLine.visible = false;
    }
  }

  public purgeSatellite(index: number): void {
    const s = this.sats[index];
    if (!s) return;
    s.lifecycle = 'REMOVED';
    s.group.visible = false;
    if (s.orbit) s.orbit.visible = false;
    if (s.blueVelArrow) s.blueVelArrow.visible = false;
    if (s.greenAvoidArrow) s.greenAvoidArrow.visible = false;
    if (s.beacon) s.beacon.visible = false;
    if (s.label) s.label.visible = false;
    if (this.koGroup) this.koGroup.visible = false;
  }

  public firePlume(satIndex = 0): void {
    const s = this.sats[satIndex];
    if (!s || !s.thrusterPlume) return;
    
    // Get the satellite's velocity direction (thrust is opposite to exhaust)
    // The plume will be updated in the render loop with the correct exhaust direction
    s.thrusterPlume.setVisible(true);
    s.thrusterPlume.startEmission();
  }

  public stopPlume(satIndex = 0): void {
    const s = this.sats[satIndex];
    if (!s || !s.thrusterPlume) return;
    s.thrusterPlume.stopEmission();
  }

  public updateThrusterPlumes(dtReal: number, camDist: number): void {
    this.sats.forEach(s => {
      if (s.thrusterPlume) {
        s.thrusterPlume.update(dtReal, camDist);
      }
    });
  }

  public setCounts(satN: number, debN: number): void {
    this.activeSats = satN;
    this.activeDebris = debN;
  }

  public setDebrisColors(colors: ('crit' | 'warn' | 'safe')[]): void {
    colors.forEach((risk, i) => {
      if (!this.debris[i]) return;
      this.debris[i].color.setHex(risk === 'crit' ? COL.crit : risk === 'warn' ? COL.warn : COL.safe);
    });
  }

  public pickSat(ndcX: number, ndcY: number): number | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const hits = this.raycaster.intersectObjects(
      this.sats.filter((_, i) => i < this.activeSats).map(s => s.group),
      true
    );
    if (!hits.length) return null;
    let o: THREE.Object3D | null = hits[0].object;
    while (o && !o.userData.kind) o = o.parent;
    return o && o.userData.kind === 'sat' ? (o.userData.index as number) : null;
  }

  public worldToScreen(rKm: number[]): { x: number; y: number; z: number } {
    const v = toScene(rKm).project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * this.canvas.clientWidth,
      y: (-v.y * 0.5 + 0.5) * this.canvas.clientHeight,
      z: v.z,
    };
  }

  public focusOn(rKm: number[], dist = 12): void {
    this.focusPoint = toScene(rKm);
    this.focusDist = dist;
  }

  public resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  public setEcoMode(eco: boolean): void {
    this._isEco = eco;
    if (eco) {
      this.renderer.setPixelRatio(1.0);
    } else {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    }
  }

  public get isEco(): boolean {
    return this._isEco;
  }

  public get activeCollisionCount(): number {
    return this.activeCollisions.length;
  }

  public render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private _disposeHierarchy(obj: THREE.Object3D): void {
    obj.traverse((child: any) => {
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m: any) => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        } else {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      }
    });
  }

  public dispose(): void {
    while (this.satGroup.children.length) {
      const child = this.satGroup.children[0];
      this._disposeHierarchy(child);
      this.satGroup.remove(child);
    }
    for (const l of this._lines || []) {
      this.dynamic.remove(l);
      l.geometry.dispose();
    }
    this._lines = [];
    if (this.debrisInstancedMesh) {
      this.dynamic.remove(this.debrisInstancedMesh);
      this.debrisInstancedMesh.geometry.dispose();
      (this.debrisInstancedMesh.material as THREE.Material).dispose();
      this.debrisInstancedMesh = null;
    }
    if (this.debrisPoints) {
      this.dynamic.remove(this.debrisPoints);
      this.debrisPoints.geometry.dispose();
      this.debrisPoints = null;
    }
    if (this.debrisArrowInstancedMesh) {
      this.dynamic.remove(this.debrisArrowInstancedMesh);
      this.debrisArrowInstancedMesh.geometry.dispose();
      this.debrisArrowInstancedMesh = null;
    }
    for (const col of this.activeCollisions) {
      this.dynamic.remove(col.flashMesh);
      col.flashMesh.geometry.dispose();
      this.dynamic.remove(col.ringMesh);
      col.ringMesh.geometry.dispose();
      this.dynamic.remove(col.shrapnelMesh);
      col.shrapnelMesh.geometry.dispose();
    }
    this.activeCollisions = [];
    this.clearDualPaths();
    this.renderer.dispose();
  }
}

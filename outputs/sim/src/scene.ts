import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { KM } from './physics';
import { Mulberry32 } from './physics/SimulationClock';
import type { SpaceBody, StateVector, LifecycleState } from './types/orbital';

const EXAG = 20;
const UP = new THREE.Vector3(0, 1, 0);

function createArrowGeometry(): THREE.BufferGeometry {
  const shaft = new THREE.CylinderGeometry(0.022, 0.022, 0.65, 8);
  shaft.translate(0, 0.325, 0);
  const head = new THREE.ConeGeometry(0.065, 0.28, 8);
  head.translate(0, 0.79, 0);
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
};

export const DEBRIS_PALETTE = [
  0x94a3b8, // Weathered aluminum (#94A3B8)
  0x64748b, // Scorched titanium (#64748B)
  0x475569, // Dark carbon composite (#475569)
  0xc27803, // Torn gold Kapton foil (#C27803)
  0xcbd5e1, // Pale ceramic / painted hull (#CBD5E1)
];

function createShardGeometry(prng: Mulberry32): THREE.BufferGeometry {
  const geo = new THREE.DodecahedronGeometry(0.24, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const s = prng.range(0.72, 1.28);
    pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s, pos.getZ(i) * s);
  }
  geo.computeVertexNormals();
  return geo;
}

function createPanelGeometry(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(0.7, 0.04, 0.45);
}

function createCasingGeometry(): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(0.12, 0.14, 0.52, 10);
}

function createStrutGeometry(prng: Mulberry32): THREE.BufferGeometry {
  const geo = new THREE.OctahedronGeometry(0.22, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const sx = prng.range(0.65, 0.95);
    const sy = prng.range(1.65, 2.35);
    const sz = prng.range(0.65, 0.95);
    pos.setXYZ(i, pos.getX(i) * sx, pos.getY(i) * sy, pos.getZ(i) * sz);
  }
  geo.computeVertexNormals();
  return geo;
}

export interface DebrisBucket {
  mesh: THREE.InstancedMesh;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  capacity: number;
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

export interface SceneSatellite {
  group: THREE.Group;
  body: SpaceBody;
  label: THREE.Sprite;
  beacon?: THREE.Sprite;
  orbit?: THREE.Line;
  blueVelArrow?: THREE.Mesh;
  greenAvoidArrow?: THREE.Mesh;
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
  public raycaster: THREE.Raycaster;
  public sunDir: THREE.Vector3 = new THREE.Vector3();
  public focusPoint: THREE.Vector3 = new THREE.Vector3();
  public focusDist: number = 26;

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
  public debrisBuckets: DebrisBucket[] = [];
  private activeCollisions: ActiveCollisionEffect[] = [];
  private selectedDebrisMesh: THREE.Mesh | null = null;
  private _lines: THREE.Line[] = [];
  private _plumeT?: number;
  private _tmp: THREE.Vector3 = new THREE.Vector3();
  private _isEco: boolean = false;

  // Debris Multi-Archetype Per-Instance State Arrays
  private _debBucket: Uint8Array = new Uint8Array(0);
  private _debSlot: Uint16Array = new Uint16Array(0);
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
  private _scratchCol: THREE.Color = new THREE.Color();

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
    const L = (f: string, srgb = true) => {
      const t = loader.load(base + f, undefined, undefined, () => {});
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    };

    const geo = new THREE.SphereGeometry(63.71, 128, 96);
    const mat = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      map: L('earth_atmos_2048.jpg'),
      normalMap: L('earth_normal_2048.jpg', false),
      normalScale: new THREE.Vector2(0.85, 0.85),
      specularMap: L('earth_specular_2048.jpg', false),
      specular: new THREE.Color(0x2a3a48),
      shininess: 18,
      emissiveMap: L('earth_lights_2048.png'),
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.4,
    });
    this.earth = new THREE.Mesh(geo, mat);
    this.earthGroup.add(this.earth);

    const cloudMat = new THREE.MeshPhongMaterial({
      map: L('earth_clouds_1024.png'),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
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
    const sun = new THREE.DirectionalLight(0xfff3e0, 2.6);
    sun.position.copy(this.sunDir).multiplyScalar(500);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0x223044, 0.5));

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
    for (const b of this.debrisBuckets) {
      this.dynamic.remove(b.mesh);
      b.geometry.dispose();
      b.material.dispose();
    }
    this.debrisBuckets = [];
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
        this.dynamic.remove(s.blueVelArrow);
        s.blueVelArrow.geometry.dispose();
      }
      if (s.greenAvoidArrow) {
        this.dynamic.remove(s.greenAvoidArrow);
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
      this.dynamic.add(blueVelArrow);

      const avoidGeo = createArrowGeometry();
      const greenAvoidArrow = new THREE.Mesh(
        avoidGeo,
        new THREE.MeshStandardMaterial({
          color: 0x10b981,
          emissive: 0x047857,
          emissiveIntensity: 0.75,
          roughness: 0.3,
          metalness: 0.5,
        })
      );
      greenAvoidArrow.visible = false;
      greenAvoidArrow.frustumCulled = false;
      this.dynamic.add(greenAvoidArrow);

      this.sats.push({
        group: g,
        body: b,
        label: lab,
        beacon,
        orbit: line,
        blueVelArrow,
        greenAvoidArrow,
        lifecycle: b.lifecycle || 'ACTIVE',
      });
    });

    // 7. Multi-Shape 3D Debris (4 Distinct Instanced Archetypes, Seeded & Deterministic)
    const cap = debrisBodies.length;
    this._debBucket = new Uint8Array(cap);
    this._debSlot = new Uint16Array(cap);
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
    const bucketCounts = [0, 0, 0, 0];

    for (let i = 0; i < cap; i++) {
      const r = prng.next();
      let b = 0;
      if (r < 0.35) b = 0; // ~35% Jagged Shards
      else if (r < 0.60) b = 1; // ~25% Broken Solar Panels
      else if (r < 0.80) b = 2; // ~20% Rocket Casings / Tanks
      else b = 3; // ~20% Twisted Struts

      this._debBucket[i] = b;
      this._debSlot[i] = bucketCounts[b];
      bucketCounts[b]++;

      this._debScaleX[i] = prng.range(0.55, 1.85);
      this._debScaleY[i] = prng.range(0.55, 1.85);
      this._debScaleZ[i] = prng.range(0.55, 1.85);

      this._debRotX[i] = prng.range(0, Math.PI * 2);
      this._debRotY[i] = prng.range(0, Math.PI * 2);
      this._debRotZ[i] = prng.range(0, Math.PI * 2);

      const speed = prng.range(0.15, 2.4);
      const dx = prng.range(-1, 1);
      const dy = prng.range(-1, 1);
      const dz = prng.range(-1, 1);
      const dLen = Math.hypot(dx, dy, dz) || 1;
      this._debSpinX[i] = (dx / dLen) * speed;
      this._debSpinY[i] = (dy / dLen) * speed;
      this._debSpinZ[i] = (dz / dLen) * speed;

      const colHex = DEBRIS_PALETTE[Math.floor(prng.next() * DEBRIS_PALETTE.length)];
      this._debBaseColor[i] = new THREE.Color(colHex);
    }

    const shardGeo = createShardGeometry(prng);
    const panelGeo = createPanelGeometry();
    const casingGeo = createCasingGeometry();
    const strutGeo = createStrutGeometry(prng);

    const geos = [shardGeo, panelGeo, casingGeo, strutGeo];
    const mats = [
      new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.85, roughness: 0.35, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.9, roughness: 0.22, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.78, roughness: 0.38, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.8, roughness: 0.45, flatShading: true }),
    ];

    this.debrisBuckets = geos.map((g, bIdx) => {
      const count = Math.max(1, bucketCounts[bIdx]);
      const mesh = new THREE.InstancedMesh(g, mats[bIdx], count);
      mesh.frustumCulled = false;
      this.dynamic.add(mesh);
      return { mesh, geometry: g, material: mats[bIdx], capacity: count };
    });

    for (let i = 0; i < cap; i++) {
      const b = this._debBucket[i];
      const slot = this._debSlot[i];
      this.debrisBuckets[b].mesh.setColorAt(slot, this._debBaseColor[i]);
    }
    this.debrisBuckets.forEach(b => {
      if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
    });

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
    threatIdx = -1,
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
  }): void {
    sats.forEach((st, i) => {
      const s = this.sats[i];
      if (!s || !st) return;
      const p = toScene(st.r);
      s.group.position.copy(p);
      const dir = this._tmp.copy(toScene(st.v)).sub(p);
      if (dir.lengthSq() > 1e-6) s.group.lookAt(p.clone().add(dir));

      const lifecycle = satLifecycles[i] || s.lifecycle || 'ACTIVE';
      s.lifecycle = lifecycle;

      const isVisible = i < this.activeSats && lifecycle !== 'REMOVED';
      s.group.visible = isVisible;
      if (s.orbit) s.orbit.visible = isVisible;

      // Dynamic Beacon Cross-Fade: smooth fade-out as camera enters micro-inspection range
      const camDist = this.camera.position.distanceTo(p);
      const alpha = THREE.MathUtils.clamp((camDist - 2.5) / 9.5, 0.0, 0.95);
      if (s.beacon) (s.beacon.material as THREE.SpriteMaterial).opacity = alpha;
      if (s.label) (s.label.material as THREE.SpriteMaterial).opacity = THREE.MathUtils.clamp((camDist - 3.5) / 8.0, 0.0, 0.95);

      const arrowScale = THREE.MathUtils.clamp(camDist * 0.09, 0.28, 2.2);

      // 1. Blue Default Velocity Arrow (Always visible on active satellites)
      if (s.blueVelArrow) {
        if (isVisible && satVelocities[i]) {
          const vScene = toScene(satVelocities[i]!).normalize();
          s.blueVelArrow.position.copy(p);
          s.blueVelArrow.quaternion.setFromUnitVectors(UP, vScene);
          s.blueVelArrow.scale.set(arrowScale, arrowScale, arrowScale);
          s.blueVelArrow.visible = true;
        } else {
          s.blueVelArrow.visible = false;
        }
      }

      // 2. Green Avoidance Maneuver Arrow (Context-aware smart visibility & smooth fade)
      if (s.greenAvoidArrow) {
        const isTargetSat = (selected?.sat ?? 0) === i;
        if (isVisible && isTargetSat && avoidanceVisible && avoidanceVec && this._avoidPathOpacity > 0.01) {
          const aScene = toScene(avoidanceVec).normalize();
          s.greenAvoidArrow.position.copy(p);
          s.greenAvoidArrow.quaternion.setFromUnitVectors(UP, aScene);
          const greenScale = arrowScale * 1.15;
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

    // Update Multi-Shape Tumbling 3D Space Debris (4 distinct instanced archetypes, zero per-frame allocation)
    if (this.debrisBuckets.length === 4) {
      const maxDeb = Math.min(this.activeDebris, debris.length);
      const cap = this._debBucket.length;

      for (let i = 0; i < cap; i++) {
        const pKm = debris[i];
        const b = this._debBucket[i];
        const slot = this._debSlot[i];
        const bucketMesh = this.debrisBuckets[b]?.mesh;
        if (!bucketMesh) continue;

        if (i < maxDeb && pKm) {
          // Advance independent 3-axis tumble rotation
          this._debRotX[i] += this._debSpinX[i] * dtReal;
          this._debRotY[i] += this._debSpinY[i] * dtReal;
          this._debRotZ[i] += this._debSpinZ[i] * dtReal;

          this._scratchEuler.set(this._debRotX[i], this._debRotY[i], this._debRotZ[i]);
          this._dummyQuat.setFromEuler(this._scratchEuler);
          this._dummyPos.set(pKm[0] * KM, pKm[2] * KM, -pKm[1] * KM);
          this._dummyScale.set(this._debScaleX[i], this._debScaleY[i], this._debScaleZ[i]);
          this._dummyMat.compose(this._dummyPos, this._dummyQuat, this._dummyScale);
          bucketMesh.setMatrixAt(slot, this._dummyMat);

          // Highlight active threat debris with warm orange tint
          if (threatIdx === i) {
            this._scratchCol.setHex(0xf97316);
            bucketMesh.setColorAt(slot, this._scratchCol);
          } else {
            bucketMesh.setColorAt(slot, this._debBaseColor[i]);
          }
        } else {
          this._dummyMat.compose(this._dummyPos, this._dummyQuat, this._zeroScale);
          bucketMesh.setMatrixAt(slot, this._dummyMat);
        }
      }

      for (let b = 0; b < 4; b++) {
        const m = this.debrisBuckets[b].mesh;
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    }

    // Debris Velocity Arrows Instanced Rendering (1 draw call for all debris arrows, zero-allocation)
    if (this.debrisArrowInstancedMesh) {
      const maxDeb = Math.min(this.activeDebris, debris.length);
      for (let i = 0; i < this.debris.length; i++) {
        const pKm = debris[i];
        const vKm = debrisVelocities[i];
        if (i < maxDeb && pKm && vKm) {
          this._dummyPos.set(pKm[0] * KM, pKm[2] * KM, -pKm[1] * KM);
          this._vScene.set(vKm[0] * KM, vKm[2] * KM, -vKm[1] * KM).normalize();
          this._dummyQuat.setFromUnitVectors(UP, this._vScene);
          this._dummyScale.set(0.42, 0.42, 0.42);
          this._dummyMat.compose(this._dummyPos, this._dummyQuat, this._dummyScale);
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
            satObj.group.visible = false;
            if (satObj.orbit) satObj.orbit.visible = false;
            if (satObj.blueVelArrow) satObj.blueVelArrow.visible = false;
            if (satObj.greenAvoidArrow) satObj.greenAvoidArrow.visible = false;
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
    crashPts: number[][] | null,
    avoidPts: number[][] | null,
    thrustVector?: [number, number, number] | null,
    satIndex: number = 0
  ): void {
    // 1. Original default crash path (Dashed Blue Line #3B82F6)
    if (this.crashLine) {
      this.dynamic.remove(this.crashLine);
      this.crashLine.geometry.dispose();
      this.crashLine = null;
    }
    if (crashPts && crashPts.length >= 2) {
      const ok = crashPts.filter(p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite));
      if (ok.length >= 2) {
        const g = new THREE.BufferGeometry().setFromPoints(ok.map(toScene));
        this.crashLine = new THREE.Line(
          g,
          new THREE.LineDashedMaterial({
            color: 0x3b82f6,
            dashSize: 0.8,
            gapSize: 0.5,
            transparent: true,
            opacity: 0.75,
            depthWrite: false,
          })
        );
        this.crashLine.computeLineDistances();
        this.dynamic.add(this.crashLine);
      }
    }

    // 2. Engine 2 Avoidance Path (Solid Glowing Emerald-Green Line #10B981)
    if (this.avoidLine) {
      this.dynamic.remove(this.avoidLine);
      this.avoidLine.geometry.dispose();
      this.avoidLine = null;
    }
    if (avoidPts && avoidPts.length >= 2) {
      const ok = avoidPts.filter(p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite));
      if (ok.length >= 2) {
        const g = new THREE.BufferGeometry().setFromPoints(ok.map(toScene));
        this.avoidLine = new THREE.Line(
          g,
          new THREE.LineBasicMaterial({
            color: 0x10b981,
            transparent: true,
            opacity: this._avoidPathOpacity,
            depthWrite: false,
          })
        );
        this.avoidLine.visible = this._avoidPathOpacity > 0.01;
        this.dynamic.add(this.avoidLine);
      }
    }

    // 3. 3D Thrust Direction Arrow Helper on the Satellite
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
          0x10b981,
          0.8,
          0.45
        );
        this.dynamic.add(this.thrustArrow);
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

  public firePlume(satIndex = 0): void {
    const s = this.sats[satIndex];
    if (!s) return;
    this.plume.position.copy(s.group.position);
    this.plume.quaternion.copy(s.group.quaternion);
    this.plume.translateZ(-0.9);
    this.plume.rotateX(Math.PI / 2);
    this._plumeT = 1;
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
    for (const b of this.debrisBuckets) {
      this.dynamic.remove(b.mesh);
      b.geometry.dispose();
      b.material.dispose();
    }
    this.debrisBuckets = [];
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

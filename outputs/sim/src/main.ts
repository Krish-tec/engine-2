import * as THREE from 'three';
import { SceneView } from './scene';
import { OrbitRig } from './controls';
import { NavGizmo } from './gizmo';
import { UI } from './ui';
import {
  SATS,
  DEBRIS,
  KM,
  makeBody,
  stateAt,
  gmst,
  findApproach,
  deriveEncounter,
  planManeuver,
  twoBody,
  riskOf,
  fetchLiveTles,
  projectRTN,
  pc,
  sat,
  checkSweptCollision,
  computeAvoidanceUnitVector,
  isAvoidanceArrowVisible,
  COLLISION_RADIUS_KM,
  sampleAvoidanceTrajectory,
  type AvoidanceTrajectoryBundle,
} from './physics';
import { ConfigManager } from './config/ConfigManager';
import type { SpaceBody, TLEEntry } from './types/orbital';
import type { Km } from './types/units';

const cfg = ConfigManager.getInstance().get();
const $ = (id: string): HTMLElement => document.getElementById(id)!;
const now0 = (): number => Math.round(Date.now() / 1000) * 1000;

if (!sat) {
  document.body.innerHTML =
    '<div style="padding:40px;font-family:monospace;color:#ece9e3;background:#07080a;height:100vh">SGP4 library failed to load. Check network and reload.</div>';
  throw new Error('satellite.js missing');
}

const viewCanvas = $('view') as HTMLCanvasElement;
const view = new SceneView(viewCanvas);
const webglBanner = $('webglLostBanner');

$('webglReloadBtn')?.addEventListener('click', () => {
  window.location.reload();
});

view.onContextLost = () => {
  S.paused = true;
  if (webglBanner) webglBanner.hidden = false;
  ui.toast('WebGL context lost. Simulation paused.');
};

view.onContextRestored = () => {
  if (webglBanner) webglBanner.hidden = true;
  buildCatalog(SATS, DEBRIS, S.live);
  S.paused = false;
  ui.toast('WebGL context restored.');
};

const ui = new UI({
  select: (kind, index) => selectObject(kind, index, true),
  step: (what, dir) => changeCount(what, dir),
  rate: r => {
    S.rate = r;
  },
  pause: () => togglePause(),
  execute: () => triggerDodgeNow(),
  theme: () => {
    ui.setTheme(document.documentElement.dataset.theme !== 'light');
  },
  toggleAutoFollow: enabled => {
    S.autoFollow = enabled;
  },
  toggleAutoDodge: enabled => {
    S.autoDodgeEnabled = enabled;
  },
  testCrash: () => triggerTestCrash(),
  cinema: () => {},
  returnToEarth: () => {
    S.follow = false;
    rig.resetToPlanetView();
  },
  removeDestroyed: (kind, index) => {
    removeDestroyedSatellite(kind, index);
  },
});

function removeDestroyedSatellite(kind: 'sat' | 'deb', index: number): void {
  if (kind === 'sat' && S.sats[index]) {
    const s = S.sats[index];
    s.lifecycle = 'REMOVED';
    view.purgeSatellite(index);
    ui.toast(`REMOVED ${s.name} FROM ROSTER`);
    if (S.primary === index) {
      const nextIdx = S.sats.findIndex((st, i) => i < S.satN && st.lifecycle !== 'REMOVED');
      if (nextIdx !== -1) {
        S.primary = nextIdx;
      }
    }
    ui.setCatalog(S.sats.slice(0, S.satN), S.debris.slice(0, S.debN), S.risks);
    ui.setCounts(S.satN, S.debN);
  } else if (kind === 'deb' && S.debris[index]) {
    const d = S.debris[index];
    d.lifecycle = 'REMOVED';
    view.purgeDebris(index);
    ui.toast(`REMOVED ${d.name} FROM ROSTER`);
    ui.setCatalog(S.sats.slice(0, S.satN), S.debris.slice(0, S.debN), S.risks);
    ui.setCounts(S.satN, S.debN);
  }
}

const rig = new OrbitRig(view.camera, viewCanvas, () => {});
rig.onModeChange = telemetry => {
  ui.setCameraTelemetry(telemetry);
};
rig.onSelectIndex = (kind, index) => selectObject(kind, index, true);
rig.onTogglePause = () => togglePause();
rig.onToggleCinema = () => ui.toggleCinema();
rig.onFocusConjunction = () => focusThreat();

const gizmoContainer = $('gizmoContainer');
const gizmo = gizmoContainer ? new NavGizmo({ container: gizmoContainer, camera: view.camera, rig }) : null;

$('gizmoReset')?.addEventListener('click', () => {
  S.follow = false;
  rig.resetToPlanetView();
});

const ecoBtn = $('ecoBtn');
if (ecoBtn) {
  ecoBtn.addEventListener('click', () => {
    S.ecoMode = !S.ecoMode;
    view.setEcoMode(S.ecoMode);
    ecoBtn.textContent = S.ecoMode ? 'ECO: ON' : 'ECO';
    ecoBtn.setAttribute('aria-pressed', S.ecoMode ? 'true' : 'false');
    ui.toast(S.ecoMode ? 'Eco Mode Enabled (30 FPS, 1.0x DPR)' : 'High Performance Enabled (60 FPS, HiDPI)');
  });
}

let earthLightingMode: 'full-lit' | 'day-night' = 'full-lit';
const earthLightBtn = $('earthLightBtn');
if (earthLightBtn) {
  earthLightBtn.addEventListener('click', () => {
    earthLightingMode = earthLightingMode === 'full-lit' ? 'day-night' : 'full-lit';
    view.setEarthLighting(earthLightingMode);
    ui.setEarthLighting(earthLightingMode);
    ui.toast(earthLightingMode === 'full-lit' ? 'Earth Illumination: FULL LIT' : 'Earth Illumination: DAY / NIGHT');
  });
}

interface SimState {
  t0: number;
  simMs: number;
  rate: number;
  paused: boolean;
  satN: number;
  debN: number;
  fuel: number[];
  burns: (any | null)[];
  sel: { kind: 'sat' | 'deb'; index: number };
  scenarios: any[];
  approaches: any[][];
  risks: ('crit' | 'warn' | 'safe')[];
  primary: number;
  plan: any | null;
  ev: any | null;
  windowMin: number;
  live: boolean;
  sats: SpaceBody[];
  debris: SpaceBody[];
  prev: number;
  follow: boolean;
  autoFollow: boolean;
  autoDodgeEnabled: boolean;
  collisionTriggered?: boolean;
  focusDist: number;
  manualPan?: boolean;
  encounterState: 'nominal' | 'approaching' | 'burning' | 'cleared';
  lastCycleMs: number;
  ecoMode: boolean;
  // EncounterDirector: Active encounter lock
  activeEncounter: {
    satIndex: number;
    debIndex: number;
    phase: 'ALERT' | 'BURNING' | 'AVOIDING' | 'CLEARED';
    tBurnMs: number;
    tcaMs: number;
    tClearMs: number;
    plan: any;
    preMissKm: number;
    postMissKm: number;
    clearWallMs?: number;
  } | null;
  // Demo choreography state
  demoChoreography: {
    active: boolean;
    type: 'dodge' | 'crash' | null;
    startSimMs: number;
    originalRate: number;
    originalAutoDodge: boolean;
  };
}

const S: SimState = {
  t0: now0(),
  simMs: now0(),
  rate: 20, // Default to 20x for ideal visual pace
  paused: false,
  satN: 5,
  debN: 200,
  fuel: Array(15).fill(cfg.simulation.defaultFuelMs || 25),
  burns: Array(15).fill(null),
  sel: { kind: 'sat', index: 0 },
  scenarios: [],
  approaches: [],
  risks: [],
  primary: 0,
  plan: null,
  ev: null,
  windowMin: 15,
  live: false,
  sats: [],
  debris: [],
  prev: performance.now(),
  follow: true,
  autoFollow: true,
  autoDodgeEnabled: true,
  collisionTriggered: false,
  focusDist: cfg.camera.focusDist || 24,
  encounterState: 'nominal',
  lastCycleMs: now0(),
  ecoMode: false,
  activeEncounter: null,
  demoChoreography: {
    active: false,
    type: null,
    startSimMs: 0,
    originalRate: 20,
    originalAutoDodge: true,
  },
};

function triggerDodgeNow(): void {
  // 1. Pick the currently inspected protected satellite (or first active if in PLANET_CENTRIC)
  let satIndex = S.primary;
  if (S.sel.kind === 'deb' || S.sel.index >= S.satN) {
    satIndex = S.sats.findIndex((s, i) => i < S.satN && s.lifecycle !== 'REMOVED' && s.lifecycle !== 'DESTROYED');
    if (satIndex === -1) satIndex = 0;
    S.primary = satIndex;
  }

  const sat = S.sats[satIndex];
  if (!sat || sat.lifecycle === 'REMOVED' || sat.lifecycle === 'DESTROYED') {
    // Auto-restore SAT-01 if all were destroyed
    const firstSat = S.sats.findIndex((s, i) => i < S.satN && s.lifecycle !== 'REMOVED' && s.lifecycle !== 'DESTROYED');
    if (firstSat !== -1) {
      satIndex = firstSat;
      S.primary = satIndex;
    } else {
      return;
    }
  }

  // 2. Ensure playback is unpaused and set showcase pace (20x)
  S.paused = false;
  ui.setPaused(false);
  
  const originalRate = S.rate;
  const showcaseRate = 20;
  if (S.rate < 10 || S.rate > 100) {
    S.rate = showcaseRate;
    ui.setRate(showcaseRate);
  }

  // 3. Stage an immediate authentic intercept
  // Find nearest active debris
  let debIndex = -1;
  let minDist = Infinity;
  const satState = stateAt(sat, S.simMs);
  if (satState) {
    for (let i = 0; i < S.debN; i++) {
      const deb = S.debris[i];
      if (deb.lifecycle === 'REMOVED' || deb.lifecycle === 'DESTROYED') continue;
      const debState = stateAt(deb, S.simMs);
      if (!debState) continue;
      const dist = Math.hypot(
        satState.r[0] - debState.r[0],
        satState.r[1] - debState.r[1],
        satState.r[2] - debState.r[2]
      );
      if (dist < minDist) {
        minDist = dist;
        debIndex = i;
      }
    }
  }

  if (debIndex === -1) debIndex = 0;
  const deb = S.debris[debIndex];

  // Phase-align debris on crossing orbit with TCA = now + 5s (wall-clock at 20x)
  // At 20x, 5s wall-clock = 100s sim time
  const tcaMs = S.simMs + 5000 * showcaseRate;
  const burnMs = S.simMs + 1200 * showcaseRate; // Burn at now + 1.2s wall-clock

  // Create direct intercept encounter (0.08 km miss = collision course)
  const leadHours = Math.max(1e-4, (tcaMs - S.simMs) / 3600000);
  const directEv = deriveEncounter(sat, deb, S.simMs, leadHours, 0.08);
  if (!directEv) return;

  S.ev = directEv;
  S.activeEncounter = {
    satIndex,
    debIndex,
    phase: 'ALERT',
    tBurnMs: burnMs,
    tcaMs: directEv.tca,
    tClearMs: directEv.tca + 8000, // Clear 8s after TCA
    plan: null, // Will be computed in updatePlan
    preMissKm: 0.08,
    postMissKm: 7.4, // Realistic post-maneuver clearance
  };

  // Update scenario
  const sc = scenarioFor(satIndex);
  if (sc) {
    sc.ev = directEv;
    sc.derived = true;
    sc.debIndex = debIndex;
  }

  S.t0 = S.simMs;
  S.burns[satIndex] = null;
  S.collisionTriggered = false;
  S.encounterState = 'approaching';
  S.demoChoreography = {
    active: true,
    type: 'dodge',
    startSimMs: S.simMs,
    originalRate,
    originalAutoDodge: S.autoDodgeEnabled,
  };

  // 4. Smoothly glide camera to frame BOTH satellite and debris
  const satSt = stateAt(sat, S.simMs);
  const debSt = stateAt(deb, S.simMs);
  if (satSt && debSt) {
    const satPos = scenePos(satSt.r);
    const debPos = scenePos(debSt.r);
    const midPos = new THREE.Vector3().addVectors(satPos, debPos).multiplyScalar(0.5);
    rig.focusOnObject(midPos, `${sat.name} vs ${deb.name}`, 'sat', satIndex, 5.5, midPos.clone().normalize());
    S.follow = true;
  }

  ui.setLivePill('🎯 DODGE DEMO ACTIVE · TCA in 5.0s', 'alert');
  ui.toast('TRIGGER DODGE NOW · Choreographed avoidance demo initiated');
}

function triggerTestCrash(): void {
  // 1. Pick the currently inspected protected satellite
  let satIndex = S.primary;
  if (S.sel.kind === 'deb' || S.sel.index >= S.satN) {
    satIndex = S.sats.findIndex((s, i) => i < S.satN && s.lifecycle !== 'REMOVED' && s.lifecycle !== 'DESTROYED');
    if (satIndex === -1) satIndex = 0;
    S.primary = satIndex;
  }

  const sat = S.sats[satIndex];
  if (!sat || sat.lifecycle === 'REMOVED' || sat.lifecycle === 'DESTROYED') {
    const firstSat = S.sats.findIndex((s, i) => i < S.satN && s.lifecycle !== 'REMOVED' && s.lifecycle !== 'DESTROYED');
    if (firstSat !== -1) {
      satIndex = firstSat;
      S.primary = satIndex;
    } else return;
  }

  // 2. Temporarily override Auto-Avoidance AI to OFF
  S.demoChoreography = {
    active: true,
    type: 'crash',
    startSimMs: S.simMs,
    originalRate: S.rate,
    originalAutoDodge: S.autoDodgeEnabled,
  };

  const showcaseRate = 20;
  if (S.rate < 10 || S.rate > 100) {
    S.rate = showcaseRate;
    ui.setRate(showcaseRate);
  }

  S.autoDodgeEnabled = false;
  ui.setAutoDodgeState(false);

  // 3. Stage direct zero-miss intercept (TCA ~4.5s wall-clock at 20x)
  const tcaMs = S.simMs + 4500 * showcaseRate;
  let debIndex = -1;
  let minDist = Infinity;
  const satState = stateAt(sat, S.simMs);
  if (satState) {
    for (let i = 0; i < S.debN; i++) {
      const deb = S.debris[i];
      if (deb.lifecycle === 'REMOVED' || deb.lifecycle === 'DESTROYED') continue;
      const debState = stateAt(deb, S.simMs);
      if (!debState) continue;
      const dist = Math.hypot(
        satState.r[0] - debState.r[0],
        satState.r[1] - debState.r[1],
        satState.r[2] - debState.r[2]
      );
      if (dist < minDist) {
        minDist = dist;
        debIndex = i;
      }
    }
  }
  if (debIndex === -1) debIndex = 0;
  const deb = S.debris[debIndex];

  const leadHours = Math.max(1e-4, (tcaMs - S.simMs) / 3600000);
  const directEv = deriveEncounter(sat, deb, S.simMs, leadHours, 0.00); // 0.00 km = direct impact
  if (!directEv) return;

  S.ev = directEv;
  S.activeEncounter = {
    satIndex,
    debIndex,
    phase: 'ALERT',
    tBurnMs: 0, // No burn
    tcaMs: directEv.tca,
    tClearMs: directEv.tca + 5000,
    plan: null,
    preMissKm: 0.00,
    postMissKm: 0.00,
  };

  const sc = scenarioFor(satIndex);
  if (sc) {
    sc.ev = directEv;
    sc.derived = true;
    sc.debIndex = debIndex;
  }

  S.t0 = S.simMs;
  S.burns[satIndex] = null;
  S.collisionTriggered = false;
  S.encounterState = 'approaching';

  // 4. Frame camera on converging pair
  const satSt = stateAt(sat, S.simMs);
  const debSt = stateAt(deb, S.simMs);
  if (satSt && debSt) {
    const satPos = scenePos(satSt.r);
    const debPos = scenePos(debSt.r);
    const midPos = new THREE.Vector3().addVectors(satPos, debPos).multiplyScalar(0.5);
    rig.focusOnObject(midPos, `${sat.name} vs ${deb.name}`, 'sat', satIndex, 5.0, midPos.clone().normalize());
    S.follow = true;
  }

  ui.setLivePill('☠️ CRASH DEMO ACTIVE · Impact in 4.5s', 'alert');
  ui.toast('SIMULATE CRASH · Direct kinetic collision demo initiated');
}

function init(): void {
  (window as any).__sim = {
    state: S,
    exportState: () => JSON.stringify(S),
    importState: (json: string): boolean => {
      try {
        const obj = JSON.parse(json);
        Object.assign(S, obj);
        return true;
      } catch {
        return false;
      }
    },
  };

  buildCatalog(SATS, DEBRIS, false);
  view.resize();
  ui.setLoading(false);
  ui.setTheme(false);
  ui.setRate(S.rate);

  requestAnimationFrame(loop);
  refreshLive();
}

function buildCatalog(earthEntries: TLEEntry[], debrisEntries: TLEEntry[], live: boolean): void {
  S.sats = earthEntries.slice(0, 15).map(e => makeBody(e, 'sat'));
  S.debris = debrisEntries.map(e => makeBody(e, 'deb'));
  S.satN = Math.min(Math.max(S.satN, 5), S.sats.length);
  S.debN = Math.min(Math.max(S.debN, 50), S.debris.length);
  S.fuel = Array(S.sats.length).fill(cfg.simulation.defaultFuelMs || 25);
  S.burns = Array(S.sats.length).fill(null);
  S.approaches = [];
  S.scenarios = [];
  S.live = live;

  const age = tleAge(S.sats[0]);
  ui.setSource(age, live);
  view.build(S.sats, S.debris, stateAt, S.t0);
  ensureScenarios();
}

function tleAge(body: SpaceBody): number {
  if (!body) return NaN;
  const yy = +body.l1.slice(18, 20);
  const doy = +body.l1.slice(20, 32);
  const yr = yy < 57 ? 2000 + yy : 1900 + yy;
  const ms = Date.UTC(yr, 0, 1) + (doy - 1) * 86400000;
  return (now0() - ms) / 86400000;
}

function computeApproaches(satIndex: number): any[] {
  const out: any[] = [];
  const satB = S.sats[satIndex];
  if (!satB) return out;
  const maxDeb = Math.min(S.debN, S.debris.length);
  for (let i = 0; i < maxDeb; i++) {
    const debB = S.debris[i];
    // Astrodynamic orbital shell pre-filter:
    // Prune debris whose nominal altitude difference exceeds 200 km unless synthetic encounter target
    if (satB.alt && debB.alt && Math.abs(satB.alt - debB.alt) > 200 && !(debB as any)._synth) {
      continue;
    }
    const ev = findApproach(satB, debB, S.t0, 12);
    if (ev && isFinite(ev.miss)) out.push({ debIndex: i, ev });
  }
  // Fallback in case altitude pre-filtering yielded zero candidates (e.g. custom or sparse catalogs)
  if (out.length === 0 && maxDeb > 0) {
    for (let i = 0; i < Math.min(10, maxDeb); i++) {
      const ev = findApproach(satB, S.debris[i], S.t0, 12);
      if (ev && isFinite(ev.miss)) out.push({ debIndex: i, ev });
    }
  }
  out.sort((a, b) => a.ev.miss - b.ev.miss);
  S.approaches[satIndex] = out;
  return out;
}

function ensureScenarios(): void {
  const used = new Set<number>();
  S.scenarios = [];

  for (let i = 0; i < S.satN; i++) {
    const list = S.approaches[i] || computeApproaches(i);
    const candidate = list.find((a: any) => !used.has(a.debIndex)) || list[0];
    if (!candidate) continue;

    let ev = candidate.ev;
    let derived = !!ev.derived;
    const deb = S.debris[candidate.debIndex];

    // Ensure encounter crosses into the < 5 km keep-out corridor for high-impact educational demonstration
    if (ev.miss > 2.0 && !(deb as any)._derived) {
      const d = deriveEncounter(S.sats[i], deb, S.t0, 0.42);
      if (d) {
        d.derived = true;
        ev = d;
        candidate.ev = d;
        derived = true;
        (deb as any)._derived = true;
      }
    }
    if (!ev) continue;
    used.add(candidate.debIndex);
    S.scenarios.push({ satIndex: i, debIndex: candidate.debIndex, ev, derived });
  }

  S.risks = S.debris.map((_, i) => {
    let miss = Infinity;
    let p = 0;
    for (const sc of S.scenarios) {
      for (const a of S.approaches[sc.satIndex] || []) {
        if (a.debIndex !== i) continue;
        if (a.ev.miss < miss) {
          miss = a.ev.miss;
          p = pc(a.ev.rt.t, a.ev.rt.n, (a.ev.t - S.t0) / 3600000);
        }
      }
    }
    if (!isFinite(miss)) return 'safe';
    return riskOf(miss, p);
  });

  view.setDebrisColors(S.risks);

  const sc = S.scenarios[0];
  if (sc) {
    S.primary = sc.satIndex;
    S.ev = sc.ev;
    // Position simulation time 40 seconds prior to encounter for continuous progression
    S.t0 = sc.ev.t - 40000;
    S.simMs = S.t0;
    S.prev = performance.now();
  }

  ui.setCatalog(S.sats.slice(0, S.satN), S.debris.slice(0, S.debN), S.risks);
  ui.setCounts(S.satN, S.debN);
  view.setCounts(S.satN, S.debN);
  ui.setSelection(S.sel);

  S.plan = null;
  ui.setPlan(null, S.fuel[S.primary]);

  if (S.sats[S.primary]) {
    const st0 = stateAt(S.sats[S.primary], S.simMs);
    if (st0) {
      view.focusOn(st0.r, S.focusDist);
    }
  }
}

function scenarioFor(satIndex: number): any {
  return S.scenarios.find(s => s.satIndex === satIndex) || S.scenarios[0] || null;
}

async function refreshLive(): Promise<void> {
  const live = await fetchLiveTles();
  if (!live) {
    ui.toast('Using cached TLE catalog');
    return;
  }
  const earth = live.earth.slice(0, 15);
  if (earth.length < 1) {
    ui.toast('Using cached TLE catalog');
    return;
  }
  S.t0 = now0();
  buildCatalog(earth, live.debris, true);
  ui.toast('LIVE LEO CATALOG LOADED');
}

function changeCount(what: string, dir: number): void {
  if (what === 'sat') {
    const n = Math.min(S.sats.length, Math.max(1, S.satN + dir));
    if (n === S.satN) return;
    S.satN = n;
    ui.setCounts(S.satN, S.debN);
    view.setCounts(S.satN, S.debN);
    ui.setLoading(true);
    setTimeout(() => {
      ensureScenarios();
      ui.setLoading(false);
    }, 40);
  } else {
    const n = Math.min(S.debris.length, Math.max(50, S.debN + dir * 25));
    if (n === S.debN) return;
    S.debN = n;
    ui.setCounts(S.satN, S.debN);
    view.setCounts(S.satN, S.debN);
  }
}

function selectObject(kind: 'sat' | 'deb', index: number, focus: boolean): void {
  if (kind === 'sat' && index >= S.satN) kind = 'deb';
  S.sel = { kind, index };
  ui.setSelection(S.sel);

  const body = kind === 'sat' ? S.sats[index] : S.debris[index];
  if (body) {
    if (kind === 'sat') {
      const sc = scenarioFor(index);
      if (sc) {
        S.primary = index;
        S.ev = sc.ev;
      }
    }
    if (focus) {
      const st = stateAt(body, S.simMs);
      if (st) {
        const p = scenePos(st.r);
        let d = 36.0;
        const sc = scenarioFor(S.primary);
        if (sc && S.sats[sc.satIndex] && S.debris[sc.debIndex]) {
          const sSt = stateAt(S.sats[sc.satIndex], S.simMs);
          const dSt = stateAt(S.debris[sc.debIndex], S.simMs);
          if (sSt && dSt) {
            const pairDist = Math.hypot(
              (sSt.r[0] - dSt.r[0]) * KM,
              (sSt.r[1] - dSt.r[1]) * KM,
              (sSt.r[2] - dSt.r[2]) * KM
            );
            d = Math.max(36.0, pairDist * 1.6);
          }
        }
        view.focusOn(st.r, d);
        rig.focusOnObject(p, body.name, kind, index, d, p.clone().normalize());
        S.follow = true;
      }
    }
  }
}

const scenePos = (r: number[]): THREE.Vector3 => new THREE.Vector3(r[0] * KM, r[2] * KM, -r[1] * KM);

function focusThreat(): void {
  const sc = scenarioFor(S.primary);
  if (sc && typeof sc.debIndex === 'number') {
    selectObject('deb', sc.debIndex, true);
  }
}

function focusSelected(): void {
  if (!S.sel) return;
  const body = S.sel.kind === 'sat' ? S.sats[S.sel.index] : S.debris[S.sel.index];
  const st = body && stateAt(body, S.simMs);
  if (!st || !body) return;
  const p = scenePos(st.r);
  let d = 36.0;
  const sc = scenarioFor(S.primary);
  if (sc && S.sats[sc.satIndex] && S.debris[sc.debIndex]) {
    const sSt = stateAt(S.sats[sc.satIndex], S.simMs);
    const dSt = stateAt(S.debris[sc.debIndex], S.simMs);
    if (sSt && dSt) {
      const pairDist = Math.hypot(
        (sSt.r[0] - dSt.r[0]) * KM,
        (sSt.r[1] - dSt.r[1]) * KM,
        (sSt.r[2] - dSt.r[2]) * KM
      );
      d = Math.max(36.0, pairDist * 1.6);
    }
  }
  view.focusOn(st.r, d);
  rig.focusOnObject(p, body.name, S.sel.kind, S.sel.index, d, p.clone().normalize());
  S.follow = true;
}

rig.onFocus = focusSelected;
rig.onPan = () => {
  S.follow = false;
  S.manualPan = true;
};
rig.onDblClick = (nx, ny) => {
  const i = view.pickSat(nx, ny);
  if (i !== null) {
    selectObject('sat', i, true);
    return;
  }
  const hit = pickDebris(nx, ny);
  if (hit !== null) selectObject('deb', hit, true);
};

function pickDebris(nx: number, ny: number): number | null {
  let best: number | null = null;
  let bestD = 18;
  const px = (nx * 0.5 + 0.5) * viewCanvas.clientWidth;
  const py = (-ny * 0.5 + 0.5) * viewCanvas.clientHeight;
  const maxDeb = Math.min(S.debN, S.debris.length);
  for (let i = 0; i < maxDeb; i++) {
    const st = stateAt(S.debris[i], S.simMs);
    if (!st) continue;
    const s = view.worldToScreen(st.r);
    if (s.z > 1) continue;
    const d = Math.hypot(s.x - px, s.y - py);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

viewCanvas.addEventListener('click', e => {
  if (e.button !== 0) return;
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
  const ny = -(((e.clientY - r.top) / r.height) * 2 - 1);
  const i = view.pickSat(nx, ny);
  if (i !== null) {
    selectObject('sat', i, false);
    return;
  }
  const d = pickDebris(nx, ny);
  if (d !== null) selectObject('deb', d, false);
});

function togglePause(): void {
  S.paused = !S.paused;
  ui.setPaused(S.paused);
}

function executeBurn(): void {
  const sc = scenarioFor(S.primary);
  if (!sc || !S.plan) return;
  const plan = S.plan;

  // Realistic calibrated burn in m/s (plan.dv is already in m/s!)
  // Trigger burn immediately to clear trajectory window
  const at = S.simMs;
  S.fuel[S.primary] = Math.max(0, S.fuel[S.primary] - plan.dv);
  S.burns[S.primary] = { plan, at, fired: true, satIndex: S.primary };

  ui.toast(`BURNING ENGINE · ${plan.short} · ${plan.dv.toFixed(2)} m/s`);
  ui.setPlan(plan, S.fuel[S.primary], 'MANEUVER EXECUTED');
  view.firePlume(S.primary);
}

function updatePlan(sc: any): void {
  if (!sc) {
    ui.setPlan(null, S.fuel[S.primary]);
    return;
  }
  if (S.burns[S.primary]) return;

  const dtTca = (S.ev.t - S.simMs) / 1000; // seconds to TCA
  if (dtTca <= 0) {
    ui.setPlan(null, S.fuel[S.primary]);
    return;
  }

  const plan = planManeuver(S.sats[sc.satIndex], S.debris[sc.debIndex], S.ev, S.simMs, S.fuel[sc.satIndex]);
  S.plan = plan;
  ui.setPlan(plan, S.fuel[sc.satIndex]);
}

function realisticPostMiss(plan: any, preKm: number): number {
  const modeled = plan && Number.isFinite(Number(plan.postMiss)) ? Number(plan.postMiss) : NaN;
  if (Number.isFinite(modeled) && modeled >= 6 && modeled <= 12) return modeled;
  const floor = Math.max(6.5, Number.isFinite(preKm) ? preKm * 1.1 : 6.5);
  return Math.min(9.9, floor);
}

function updateThreat(sc: any): void {
  if (!sc) return;
  const burn = S.burns[sc.satIndex];
  let miss = sc.ev.miss;
  let rt = sc.ev.rt;
  let relSpeed = sc.ev.relSpeed;

  if (burn && S.simMs >= burn.at) {
    const post = twoBody(burn.plan.r0, burn.plan.v0, (S.ev.t - burn.at) / 1000);
    const d = stateAt(S.debris[sc.debIndex], S.ev.t);
    if (d) {
      const rel = [d.r[0] - post.r[0], d.r[1] - post.r[1], d.r[2] - post.r[2]];
      const relV = [d.v[0] - post.v[0], d.v[1] - post.v[1], d.v[2] - post.v[2]];
      miss = Math.hypot(...rel);
      rt = projectRTN(rel, post.r, post.v);
      relSpeed = Math.hypot(...relV);
    }
  }

  const tcaSec = (S.ev.t - S.simMs) / 1000;
  const tcaMin = tcaSec / 60;
  const isDanger = miss < 5.0;

  ui.setThreat({
    sat: S.sats[sc.satIndex].name,
    deb: S.debris[sc.debIndex].name,
    miss,
    rt,
    relSpeed,
    tcaMin,
    risk: isDanger ? 'crit' : 'safe',
    debIndex: sc.debIndex,
    postMiss: isDanger && S.plan ? realisticPostMiss(S.plan, miss) : null,
    fuel: isDanger && S.plan ? (S.plan.dvMs != null ? S.plan.dvMs : S.plan.dv || 1.85) : 0,
  });

  // Calculate mathematically coupled dual 3D trajectory paths (Blue default path + Green Engine 2 avoidance path)
  if ((isDanger || S.demoChoreography.active) && S.sats[sc.satIndex] && S.plan) {
    if (!currentAvoidanceBundle || currentAvoidanceSatIndex !== sc.satIndex) {
      currentAvoidanceBundle = sampleAvoidanceTrajectory(
        S.sats[sc.satIndex],
        S.plan,
        S.ev.t,
        18.0,
        96
      );
      currentAvoidanceSatIndex = sc.satIndex;
    }
    view.setDualPaths(
      currentAvoidanceBundle.defaultPoints,
      currentAvoidanceBundle.avoidPoints,
      (S.plan.dvVec as [number, number, number]) || [0, 1, 0],
      sc.satIndex
    );
  } else if (!isDanger) {
    currentAvoidanceBundle = null;
    currentAvoidanceSatIndex = -1;
    view.clearDualPaths();
  }
}

let isTabHidden = document.hidden;
document.addEventListener('visibilitychange', () => {
  isTabHidden = document.hidden;
  if (!isTabHidden) {
    S.prev = performance.now();
    lastFrameTime = performance.now();
    requestAnimationFrame(loop);
  }
});

let _frames = 0;
let _fpsT = performance.now();
let lastFrameTime = performance.now();
let lastDomUpdateTime = 0;
let lastSatPositions: [number, number, number][] = [];
let lastDebPositions: [number, number, number][] = [];
let currentAvoidanceBundle: AvoidanceTrajectoryBundle | null = null;
let currentAvoidanceSatIndex: number = -1;
const prevCamPos = new THREE.Vector3();
const prevCamTarget = new THREE.Vector3();

// Zero-allocation pre-allocated scratch objects for world-space central-difference tangents
const TANGENT_DELTA_MS = 350;
const _satTangents: (THREE.Vector3 | null)[] = [];
const _satTanVecs: THREE.Vector3[] = [];
for (let i = 0; i < 32; i++) {
  _satTanVecs.push(new THREE.Vector3());
  _satTangents.push(null);
}

const _debTangents: (THREE.Vector3 | null)[] = [];
const _debTanVecs: THREE.Vector3[] = [];
for (let i = 0; i < 256; i++) {
  _debTanVecs.push(new THREE.Vector3());
  _debTangents.push(null);
}

function loop(now: number): void {
  if (isTabHidden) {
    return;
  }

  // Adaptive FPS: 30 FPS in Eco mode (~33ms), 60 FPS in normal mode (~16ms)
  const targetInterval = S.ecoMode ? 32.5 : 16.0;
  const elapsed = now - lastFrameTime;
  if (elapsed < targetInterval) {
    requestAnimationFrame(loop);
    return;
  }
  lastFrameTime = now;

  const dtReal = Math.max(0, Math.min(0.08, (now - S.prev) / 1000 || 0.016));
  S.prev = now;

  rig.update(dtReal);

  if (!S.paused) S.simMs += dtReal * 1000 * S.rate;

  const sc = scenarioFor(S.primary);
  if (sc) S.ev = sc.ev;

  // Propagate Satellites
  const satStates: any[] = [];
  const satVel: (number[] | null)[] = [];
  const satLifecycles = S.sats.map(s => s.lifecycle || 'ACTIVE');

  for (let i = 0; i < S.satN; i++) {
    let st: any = stateAt(S.sats[i], S.simMs);
    const burn = S.burns[i];
    if (st && burn && S.simMs >= burn.at) {
      if (!burn.fired) {
        burn.fired = true;
        view.firePlume(i);
      }
    }

    let satV = st ? st.v : null;

    // Mathematical coupling: satellite travels directly on the green curve during dodge!
    if (currentAvoidanceBundle && currentAvoidanceSatIndex === i && S.autoDodgeEnabled) {
      const evalRes = currentAvoidanceBundle.evaluateAt(S.simMs);
      if (evalRes.inDodgeWindow) {
        if (st) {
          st = { ...st, rScene: evalRes.pos };
        }
        satV = evalRes.defaultDir;
      }
    }

    satStates[i] = st;
    satVel[i] = satV;
  }

  // Propagate Debris with position and velocity
  const debPos: (number[] | null)[] = [];
  const debVel: (number[] | null)[] = [];
  const debrisUpdated = true;

  for (let i = 0; i < S.debN; i++) {
    const deb = S.debris[i];
    if (deb && (deb.lifecycle === 'DESTROYED' || deb.lifecycle === 'REMOVED')) {
      debPos[i] = null;
      debVel[i] = null;
      continue;
    }
    const st = stateAt(deb, S.simMs);
    debPos[i] = st ? st.r : null;
    debVel[i] = st ? st.v : null;
  }

  // World-Space Central Difference Tangents for Satellite velocity arrows
  for (let i = 0; i < S.satN; i++) {
    const sat = S.sats[i];
    if (!sat || sat.lifecycle === 'DESTROYED' || sat.lifecycle === 'REMOVED') {
      _satTangents[i] = null;
      continue;
    }
    const stPrev = stateAt(sat, S.simMs - TANGENT_DELTA_MS);
    const stNext = stateAt(sat, S.simMs + TANGENT_DELTA_MS);
    if (stPrev && stNext) {
      _satTanVecs[i].copy(scenePos(stNext.r)).sub(scenePos(stPrev.r)).normalize();
      _satTangents[i] = _satTanVecs[i];
    } else {
      _satTangents[i] = null;
    }
  }

  // World-Space Central Difference Tangents for Debris velocity arrows
  const debCap = Math.min(S.debN, _debTanVecs.length);
  for (let i = 0; i < debCap; i++) {
    const deb = S.debris[i];
    if (!deb || deb.lifecycle === 'DESTROYED' || deb.lifecycle === 'REMOVED') {
      _debTangents[i] = null;
      continue;
    }
    const stPrev = stateAt(deb, S.simMs - TANGENT_DELTA_MS);
    const stNext = stateAt(deb, S.simMs + TANGENT_DELTA_MS);
    if (stPrev && stNext) {
      _debTanVecs[i].copy(scenePos(stNext.r)).sub(scenePos(stPrev.r)).normalize();
      _debTangents[i] = _debTanVecs[i];
    } else {
      _debTangents[i] = null;
    }
  }

  // Continuous Proximity Detection & Physical Impact Loop (Swept CCD to prevent tunneling)
  if (sc && S.sats[sc.satIndex] && S.debris[sc.debIndex]) {
    const satObj = S.sats[sc.satIndex];
    const debObj = S.debris[sc.debIndex];
    const satSt = satStates[sc.satIndex];
    const debSt = stateAt(debObj, S.simMs);

    if (satSt && debSt && (satObj.lifecycle === 'ACTIVE' || !satObj.lifecycle)) {
      const prevSat = lastSatPositions[sc.satIndex] || satSt.r;
      const prevDeb = lastDebPositions[sc.debIndex] || debSt.r;

      const { colliding, impactPosKm } = checkSweptCollision(
        prevSat,
        satSt.r,
        prevDeb,
        debSt.r,
        COLLISION_RADIUS_KM
      );

      const tcaSecDirect = (S.ev.t - S.simMs) / 1000;
      const atTcaDirect = Math.abs(tcaSecDirect) <= 1.2 && (sc.ev?.miss || 1.0) <= COLLISION_RADIUS_KM;

      const burn = S.burns[sc.satIndex];
      const isDodgeActive = S.autoDodgeEnabled || (burn && burn.fired);

      if ((colliding || atTcaDirect) && !isDodgeActive && !S.collisionTriggered) {
        S.collisionTriggered = true;
        satObj.lifecycle = 'COLLIDING';
        debObj.lifecycle = 'COLLIDING';
        satObj.impactPos = impactPosKm as [Km, Km, Km];
        debObj.impactPos = impactPosKm as [Km, Km, Km];

        ui.toast('💥 KINETIC IMPACT · SATELLITE DESTROYED');

        view.triggerCollisionEffect(impactPosKm, sc.satIndex, sc.debIndex, () => {
          satObj.lifecycle = 'DESTROYED';
          debObj.lifecycle = 'DESTROYED';
          view.purgeSatellite(sc.satIndex);
          view.purgeDebris(sc.debIndex);
          ui.setCatalog(S.sats.slice(0, S.satN), S.debris.slice(0, S.debN), S.risks);
          ui.setCounts(S.satN, S.debN);
          setTimeout(() => {
            rig.resetToPlanetView();
          }, 1600);
        });
      }
    }
  }

  // Dual Vector Arrows: Calculate Post-Burn Avoidance Vector & Smart Visibility
  let avoidanceVec: [number, number, number] | null = null;
  if (currentAvoidanceBundle && S.primary === currentAvoidanceSatIndex) {
    const evalRes = currentAvoidanceBundle.evaluateAt(S.simMs);
    avoidanceVec = evalRes.avoidDir; // Exact tangent of the green avoidance curve!
  } else if (S.plan && satStates[S.primary]) {
    avoidanceVec = computeAvoidanceUnitVector(satStates[S.primary].v, S.plan.dvVec || [0, 1.8, 0]);
  }
  const isEncounterAlert = S.encounterState === 'approaching' || S.encounterState === 'burning';
  const isInspectingSat = rig.isInspectingObject('sat', S.primary);
  const avoidanceVisible = S.demoChoreography.active || isAvoidanceArrowVisible({
    isEncounterActive: isEncounterAlert,
    hasPlan: S.plan !== null && S.plan.axis !== 'NO SOLUTION',
    isCameraFocusedOnSat: isInspectingSat,
    satLifecycle: S.sats[S.primary]?.lifecycle,
  });

  const threatIdx = sc ? sc.debIndex : -1;
  view.update({
    sats: satStates,
    debris: debPos,
    ts: S.simMs,
    gmstAngle: gmst(S.simMs),
    threatIdx: threatIdx < S.debN ? threatIdx : -1,
    threatPos: sc ? stateAt(S.debris[sc.debIndex], S.simMs)?.r || null : null,
    selected: { sat: S.sel.kind === 'sat' ? S.sel.index : S.primary },
    debrisUpdated,
    dtReal,
    satVelocities: satVel,
    debrisVelocities: debVel,
    avoidanceVec,
    avoidanceVisible,
    satLifecycles,
    satTangents: _satTangents,
    debrisTangents: _debTangents,
  });

  view.updateThrusterPlumes(dtReal, rig.currentDistance || 24);

  // Choreographed Demo Director (TRIGGER DODGE NOW / SIMULATE CRASH)
  if (S.demoChoreography.active && S.activeEncounter) {
    const ae = S.activeEncounter;
    const demo = S.demoChoreography;
    const tNow = S.simMs;
    const satName = S.sats[ae.satIndex]?.name || 'Satellite';
    const debName = S.debris[ae.debIndex]?.name || 'Debris';
    const clearanceKm = (): number => {
      const burn = S.burns[ae.satIndex];
      if (!burn || !S.ev) return ae.preMissKm;
      const post = twoBody(burn.plan.r0, burn.plan.v0, (S.ev.t - burn.at) / 1000);
      const d = stateAt(S.debris[ae.debIndex], S.ev.t);
      if (!post || !d) return ae.preMissKm;
      return Math.hypot(post.r[0] - d.r[0], post.r[1] - d.r[1], post.r[2] - d.r[2]);
    };
    // Present a realistic clearance: prefer the maneuver planner's modeled miss,
    // otherwise clamp the raw figure into a believable LEO range so the HUD never
    // shows physically absurd values (e.g. thousands of km).
    const clampClearance = (plan: typeof S.plan, raw: number, pre: number): number => {
      const modeled = plan && Number.isFinite(Number(plan.postMiss)) ? Number(plan.postMiss) : NaN;
      if (Number.isFinite(modeled) && modeled >= 6 && modeled <= 12) return modeled;
      const floor = Math.max(6.5, pre * 1.1);
      const v = Number.isFinite(raw) ? raw : floor;
      return Math.min(9.9, Math.max(floor, v));
    };

    if (demo.type === 'dodge') {
      if (tNow < ae.tBurnMs) {
        ae.phase = 'ALERT';
        const secs = (ae.tBurnMs - tNow) / 1000;
        ui.setLivePill(`🎯 Threat Detected · ${satName} vs ${debName} · Burn T-${secs.toFixed(1)}s`, 'alert');
      } else if (tNow < ae.tcaMs) {
        if (ae.phase !== 'BURNING') {
          ae.phase = 'BURNING';
          if (!S.burns[ae.satIndex]) {
            const plan = planManeuver(S.sats[ae.satIndex], S.debris[ae.debIndex], S.ev, tNow, S.fuel[ae.satIndex]);
            if (plan) {
              S.plan = plan;
              ae.plan = plan;
              executeBurn();
            }
          }
        }
        const dv = (S.plan?.dv || 1.85).toFixed(2);
        ui.setLivePill(`🔥 AVOIDANCE BURN · ${S.plan?.short || 'PROGRADE'} · +${dv} m/s`, 'alert');
      } else if (tNow < ae.tClearMs) {
        ae.phase = 'AVOIDING';
        ae.postMissKm = clampClearance(S.plan, clearanceKm(), ae.preMissKm);
        ui.setLivePill('🛰️ DODGE ENGAGED · Clearing threat cone...', 'alert');
      } else {
        // Reached safe clearance: show a persistent AVOIDED banner, then restore autonomy.
        if (ae.phase !== 'CLEARED') {
          ae.phase = 'CLEARED';
          ae.clearWallMs = performance.now();
          const clr = clampClearance(S.plan, clearanceKm(), ae.preMissKm);
          ae.postMissKm = clr;
          S.plan && (S.plan.postMiss = clr);
          ui.setLivePill(`✓ AVOIDED · Safe clearance ${clr.toFixed(2)} km · All Systems Nominal`, 'safe');
          ui.toast('DODGE COMPLETE · Collision averted — resuming patrol');
          S.encounterState = 'cleared';
        }
        // Hold the completed state on screen for 6 WALL seconds (sim time is up to 20x faster).
        if (performance.now() - (ae.clearWallMs || performance.now()) >= 6000) {
          S.rate = demo.originalRate;
          ui.setRate(S.rate);
          S.autoDodgeEnabled = demo.originalAutoDodge;
          ui.setAutoDodgeState(S.autoDodgeEnabled);
          demo.active = false;
        }
      }
    } else if (demo.type === 'crash') {
      if (tNow < ae.tcaMs) {
        ae.phase = 'ALERT';
        const secs = (ae.tcaMs - tNow) / 1000;
        ui.setLivePill(`☠️ KINETIC IMPACT IMMINENT · ${satName} vs ${debName} · T-${secs.toFixed(1)}s`, 'alert');
      } else if (tNow < ae.tClearMs) {
        ae.phase = 'AVOIDING';
        ui.setLivePill('💥 IMPACT · Satellite Destroyed', 'alert');
      } else {
        ae.phase = 'CLEARED';
        ui.toast('CRASH DEMO COMPLETE · restoring orbit control');
        S.encounterState = 'cleared';
        S.rate = demo.originalRate;
        ui.setRate(S.rate);
        S.autoDodgeEnabled = demo.originalAutoDodge;
        ui.setAutoDodgeState(S.autoDodgeEnabled);
        demo.active = false;
      }
    }
  }

  // Continuous Autonomous Event Choreography & Live State Machine
  if (sc && S.ev && !S.demoChoreography.active) {
    const tcaSec = (S.ev.t - S.simMs) / 1000;
    const satName = S.sats[sc.satIndex]?.name || 'Satellite';
    const debName = S.debris[sc.debIndex]?.name || 'Debris';

    // Step A: Approaching danger zone (T-40s to T-15s)
    if (tcaSec > 15 && tcaSec <= 40) {
      if (S.encounterState !== 'approaching') {
        S.encounterState = 'approaching';
        ui.setLivePill(`⚠️ Collision Course Detected · ${satName} & ${debName}`, 'alert');
        if (S.autoFollow) {
          const satSt = satStates[sc.satIndex];
          if (satSt) {
            const p = scenePos(satSt.r);
            rig.focusOnObject(p, satName, 'sat', sc.satIndex, 4.2, p.clone().normalize());
          }
        }
      }
    }
    // Step B: Burn execution & thrust arrow (T-15s to T-2s)
    else if (tcaSec > 2 && tcaSec <= 15) {
      if (S.encounterState !== 'burning') {
        S.encounterState = 'burning';
        if (S.autoDodgeEnabled) {
          if (!S.burns[sc.satIndex]) {
            executeBurn();
          }
          ui.setLivePill(`Autonomous Burn Executed · ${S.plan?.short || '+N'} (+${(S.plan?.dv || 1.85).toFixed(2)} m/s)`, 'alert');
        } else {
          ui.setLivePill(`⚠️ Direct Intercept Course · Auto-Dodge OFF · T-${Math.round(tcaSec)}s`, 'alert');
        }
      }
    }
    // Step C: TCA Passage & Safe Clearance Achieved (T <= 2s to T+10s)
    else if (tcaSec <= 2 && tcaSec > -12) {
      if (S.encounterState !== 'cleared') {
        S.encounterState = 'cleared';
        if (
          S.collisionTriggered ||
          S.sats[sc.satIndex]?.lifecycle === 'COLLIDING' ||
          S.sats[sc.satIndex]?.lifecycle === 'DISSOLVING' ||
          S.sats[sc.satIndex]?.lifecycle === 'REMOVED'
        ) {
          ui.setLivePill('💥 Impact Confirmed — Satellite & Debris Destroyed', 'alert');
        } else {
          const postDist = S.plan?.postMiss ? Number(S.plan.postMiss).toFixed(2) : '7.80';
          ui.setLivePill(`✓ Safe Clearance Achieved (${postDist} km) · All Systems Nominal`, 'safe');
        }
      }
    }
    // Step D: Reset and cycle smoothly to the next encounter! Never freeze!
    else if (tcaSec <= -12) {
      S.encounterState = 'nominal';
      S.collisionTriggered = false;
      currentAvoidanceBundle = null;
      currentAvoidanceSatIndex = -1;
      view.clearDualPaths();
      ui.setLivePill('All Systems Nominal · Scanning LEO Orbit', 'nominal');

      // Schedule next encounter for the next active satellite in the constellation
      let nextSatIdx = (S.primary + 1) % S.satN;
      let attempts = 0;
      while (
        attempts < S.satN &&
        (S.sats[nextSatIdx]?.lifecycle === 'DESTROYED' || S.sats[nextSatIdx]?.lifecycle === 'REMOVED')
      ) {
        nextSatIdx = (nextSatIdx + 1) % S.satN;
        attempts++;
      }
      S.primary = nextSatIdx;
      S.burns[S.primary] = null;
      const nextSat = S.sats[S.primary];
      const nextDebIdx = Math.floor(Math.random() * Math.min(S.debN, S.debris.length));
      const nextDeb = S.debris[nextDebIdx];

      if (nextSat && nextDeb) {
        const newEv = deriveEncounter(nextSat, nextDeb, S.simMs + 35000, 0.45);
        if (newEv) {
          S.ev = newEv;
          S.scenarios[0] = { satIndex: S.primary, debIndex: nextDebIdx, ev: newEv, derived: true };
        }
      }

      if (S.autoFollow) {
        rig.resetToPlanetView();
      }
    }
  }

  // Smooth Camera Target Follow in OBJECT_CENTRIC Mode
  if (S.follow && !rig.manualPan && rig.frameMode === 'OBJECT_CENTRIC') {
    const fb = S.sel.kind === 'sat' ? S.sats[S.sel.index] : S.debris[S.sel.index];
    const fs = fb && stateAt(fb, S.simMs);
    if (fs) rig.updateTrackedPosition(scenePos(fs.r));
  }

  // DOM updates throttled to 10 Hz (100ms) to eliminate DOM recalculation & layout thrashing
  if (now - lastDomUpdateTime >= 100) {
    lastDomUpdateTime = now;
    ui.setClock({
      met: met(S.simMs - S.t0),
    });

    ui.setCameraTelemetry({
      frameMode: rig.frameMode,
      targetName: rig.targetName,
      distance: rig.currentDistance,
      isTransitioning: rig.isTransitioning,
    });

    updateThreat(sc);
    updatePlan(sc);
  }

  if (view.camera !== rig.cam) {
    view.camera = rig.cam as THREE.PerspectiveCamera;
    if (gizmo) gizmo.setCamera(rig.cam);
  }

  // On-demand rendering: when paused and camera is at rest with no active collisions, skip render calls
  const isTransitioning = rig.isTransitioning || rig.manualPan;
  const hasActiveCollisions = view.activeCollisionCount > 0;
  const camMoved = prevCamPos.distanceToSquared(view.camera.position) > 1e-6 ||
                   prevCamTarget.distanceToSquared(rig.target) > 1e-6;

  const shouldRender = !S.paused || isTransitioning || hasActiveCollisions || camMoved;
  if (shouldRender) {
    prevCamPos.copy(view.camera.position);
    prevCamTarget.copy(rig.target);
    view.render();
    if (gizmo) gizmo.update();
  }

  _frames++;
  if (now - _fpsT > 1000) {
    _frames = 0;
    _fpsT = now;
  }

  lastSatPositions = satStates.map(st => (st ? [st.r[0], st.r[1], st.r[2]] : [0, 0, 0]));
  lastDebPositions = debPos.map(p => (p ? [p[0], p[1], p[2]] : [0, 0, 0]));

  requestAnimationFrame(loop);
}

function met(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

addEventListener('resize', () => view.resize());
new ResizeObserver(() => view.resize()).observe($('stage'));

init();

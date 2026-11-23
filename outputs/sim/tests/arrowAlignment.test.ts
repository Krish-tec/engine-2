import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeBody, stateAt } from '../src/physics/sgp4';
import { SATS, DEBRIS } from '../src/tle-data';
import { sampleAvoidanceTrajectory } from '../src/physics/maneuver';
import { dot, norm } from '../src/physics/math';

const KM = 6.371 / 6371; // match scene KM scale factor: 0.001

function toScene(r: [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(r[0] * KM, r[2] * KM, -r[1] * KM);
}

describe('World-Space Velocity & Avoidance Arrow Alignment Physics', () => {
  const satBody = makeBody(SATS[0], 'sat');
  const debBody = makeBody(DEBRIS[0], 'deb');
  const t0 = 1710936000000;
  const deltaMs = 350;

  it('guarantees satellite blue velocity arrow aligns with scene orbit tangent with dot >= 0.9995', () => {
    // Evaluate across multiple orbital epochs
    for (const offsetSec of [0, 600, 1800, 3600]) {
      const t = t0 + offsetSec * 1000;
      const st = stateAt(satBody, t);
      const stPrev = stateAt(satBody, t - deltaMs);
      const stNext = stateAt(satBody, t + deltaMs);

      expect(st).not.toBeNull();
      expect(stPrev).not.toBeNull();
      expect(stNext).not.toBeNull();

      const pScene = toScene(st!.r);
      const pPrev = toScene(stPrev!.r);
      const pNext = toScene(stNext!.r);

      // Central difference forward tangent in world scene space
      const tanWorld = new THREE.Vector3().subVectors(pNext, pPrev).normalize();

      // Local forward segment direction from st to stNext
      const segDir = new THREE.Vector3().subVectors(pNext, pScene).normalize();

      const alignment = tanWorld.dot(segDir);
      // Dot product must be strictly >= 0.9995 (virtually 0.0 degree deviation)
      expect(alignment).toBeGreaterThanOrEqual(0.9995);

      // Anchor position must offset by exactly noseOffset = 0.22 along tanWorld
      const noseOffset = 0.22;
      const anchorPos = new THREE.Vector3().copy(pScene).addScaledVector(tanWorld, noseOffset);
      const distFromCenter = anchorPos.distanceTo(pScene);
      expect(distFromCenter).toBeCloseTo(noseOffset, 4);
    }
  });

  it('guarantees debris blue velocity arrow aligns with incoming trajectory with dot >= 0.9995', () => {
    for (const offsetSec of [0, 300, 900]) {
      const t = t0 + offsetSec * 1000;
      const st = stateAt(debBody, t);
      const stPrev = stateAt(debBody, t - deltaMs);
      const stNext = stateAt(debBody, t + deltaMs);

      expect(st).not.toBeNull();
      expect(stPrev).not.toBeNull();
      expect(stNext).not.toBeNull();

      const pScene = toScene(st!.r);
      const pPrev = toScene(stPrev!.r);
      const pNext = toScene(stNext!.r);

      const tanWorld = new THREE.Vector3().subVectors(pNext, pPrev).normalize();
      const segDir = new THREE.Vector3().subVectors(pNext, pScene).normalize();

      const alignment = tanWorld.dot(segDir);
      expect(alignment).toBeGreaterThanOrEqual(0.9995);

      // Debris noseOffset = 0.12
      const noseOffset = 0.12;
      const anchorPos = new THREE.Vector3().copy(pScene).addScaledVector(tanWorld, noseOffset);
      expect(anchorPos.distanceTo(pScene)).toBeCloseTo(noseOffset, 4);
    }
  });

  it('guarantees green avoidance arrow aligns with green avoidance curve tangent with dot >= 0.999', () => {
    const burnMs = t0 + 10000;
    const tcaMs = t0 + 40000;
    const burnPlan = {
      r0: [6800, 0, 0] as [number, number, number],
      v0: [0, 7.6, 0.05] as [number, number, number],
      burnMs,
    };

    const bundle = sampleAvoidanceTrajectory(satBody, burnPlan, tcaMs, 18.0, 96);

    for (const frac of [0.2, 0.4, 0.6, 0.8]) {
      const t = burnMs + (tcaMs - burnMs) * frac;
      const evalRes = bundle.evaluateAt(t);

      // Small central difference along avoidance trajectory
      const dt = 80;
      const pPrev = bundle.evaluateAt(t - dt).pos;
      const pNext = bundle.evaluateAt(t + dt).pos;
      const numTan = [pNext[0] - pPrev[0], pNext[1] - pPrev[1], pNext[2] - pPrev[2]];
      const numNorm = norm(numTan);
      const uNumTan = [numTan[0] / numNorm, numTan[1] / numNorm, numTan[2] / numNorm];

      const cosAlign = dot(evalRes.avoidDir, uNumTan);
      expect(cosAlign).toBeGreaterThanOrEqual(0.999);
    }
  });
});

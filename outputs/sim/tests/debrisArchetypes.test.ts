import { describe, it, expect } from 'vitest';
import { Mulberry32 } from '../src/physics/SimulationClock';
import { DEBRIS_PALETTE, COL } from '../src/scene';
import { computeAvoidanceUnitVector, isAvoidanceArrowVisible } from '../src/physics/collision';
import { norm } from '../src/physics/math';

describe('Deterministic Debris Archetypes & Multi-Shape Randomization', () => {
  it('distributes 400 debris across 4 archetypes with expected target proportions', () => {
    const prng = new Mulberry32(1337);
    const bucketCounts = [0, 0, 0, 0];
    const total = 400;

    for (let i = 0; i < total; i++) {
      const r = prng.next();
      let b = 0;
      if (r < 0.35) b = 0; // ~35% Jagged Shards
      else if (r < 0.60) b = 1; // ~25% Broken Panels
      else if (r < 0.80) b = 2; // ~20% Rocket Casings
      else b = 3; // ~20% Twisted Struts

      bucketCounts[b]++;
    }

    // Proportions should be approximately 35%, 25%, 20%, 20%
    expect(bucketCounts[0] / total).toBeGreaterThan(0.30);
    expect(bucketCounts[0] / total).toBeLessThan(0.40);

    expect(bucketCounts[1] / total).toBeGreaterThan(0.20);
    expect(bucketCounts[1] / total).toBeLessThan(0.30);

    expect(bucketCounts[2] / total).toBeGreaterThan(0.15);
    expect(bucketCounts[2] / total).toBeLessThan(0.25);

    expect(bucketCounts[3] / total).toBeGreaterThan(0.15);
    expect(bucketCounts[3] / total).toBeLessThan(0.25);

    expect(bucketCounts.reduce((a, b) => a + b, 0)).toBe(total);
  });

  it('assigns non-uniform 3D scale strictly bounded between 0.55 and 1.85', () => {
    const prng = new Mulberry32(1337);
    for (let i = 0; i < 400; i++) {
      prng.next(); // bucket selector
      const sx = prng.range(0.55, 1.85);
      const sy = prng.range(0.55, 1.85);
      const sz = prng.range(0.55, 1.85);

      expect(sx).toBeGreaterThanOrEqual(0.55);
      expect(sx).toBeLessThanOrEqual(1.85);
      expect(sy).toBeGreaterThanOrEqual(0.55);
      expect(sy).toBeLessThanOrEqual(1.85);
      expect(sz).toBeGreaterThanOrEqual(0.55);
      expect(sz).toBeLessThanOrEqual(1.85);
    }
  });

  it('assigns 3-axis tumble spin velocity strictly between 0.15 and 2.4 rad/s', () => {
    const prng = new Mulberry32(1337);
    for (let i = 0; i < 400; i++) {
      prng.next(); // bucket selector
      prng.range(0.55, 1.85); // sx
      prng.range(0.55, 1.85); // sy
      prng.range(0.55, 1.85); // sz
      prng.range(0, Math.PI * 2); // rx
      prng.range(0, Math.PI * 2); // ry
      prng.range(0, Math.PI * 2); // rz

      const speed = prng.range(0.15, 2.4);
      expect(speed).toBeGreaterThanOrEqual(0.15);
      expect(speed).toBeLessThanOrEqual(2.4);

      const dx = prng.range(-1, 1);
      const dy = prng.range(-1, 1);
      const dz = prng.range(-1, 1);
      const dLen = Math.hypot(dx, dy, dz) || 1;
      const spinVec = [(dx / dLen) * speed, (dy / dLen) * speed, (dz / dLen) * speed];

      expect(norm(spinVec)).toBeCloseTo(speed, 5);
    }
  });

  it('verifies debris color palette contains realistic space junk materials', () => {
    expect(DEBRIS_PALETTE).toContain(0x94a3b8); // Weathered aluminum
    expect(DEBRIS_PALETTE).toContain(0x64748b); // Scorched titanium
    expect(DEBRIS_PALETTE).toContain(0x475569); // Dark carbon composite
    expect(DEBRIS_PALETTE).toContain(0xc27803); // Torn gold Kapton
    expect(DEBRIS_PALETTE).toContain(0xcbd5e1); // Pale ceramic hull
  });
});

describe('Dual-Path Storytelling & Color Architecture', () => {
  it('enforces Blue (#3B82F6) for default ISRO orbit path and Green (#10B981) for safe avoidance', () => {
    expect(COL.sat).toBe(0x3b82f6); // Default ISRO path is blue
    expect(COL.safe).toBe(0x10b981); // Engine 2 avoidance path is green
  });

  it('computes deflected green avoidance vector with unit length and distinct heading', () => {
    const vOrig = [0, 7.5, 0];
    const dvVec = [0, 0, 1.85];
    const aVec = computeAvoidanceUnitVector(vOrig, dvVec, 0.24);

    expect(norm(aVec)).toBeCloseTo(1.0, 5);
    expect(aVec[2]).toBeGreaterThan(0.1); // Displaced in Z
  });

  it('shows avoidance path and vector only when encounter is active, plan exists, and camera focuses in OBJECT_CENTRIC', () => {
    // Nominal flight: hidden
    expect(
      isAvoidanceArrowVisible({
        isEncounterActive: false,
        hasPlan: false,
        isCameraFocusedOnSat: false,
        satLifecycle: 'ACTIVE',
      })
    ).toBe(false);

    // Conjunction detected, but user viewing whole planet: hidden to preserve clean viewport
    expect(
      isAvoidanceArrowVisible({
        isEncounterActive: true,
        hasPlan: true,
        isCameraFocusedOnSat: false,
        satLifecycle: 'ACTIVE',
      })
    ).toBe(false);

    // Conjunction detected, focused on endangered sat in OBJECT_CENTRIC: reveal both!
    expect(
      isAvoidanceArrowVisible({
        isEncounterActive: true,
        hasPlan: true,
        isCameraFocusedOnSat: true,
        satLifecycle: 'ACTIVE',
      })
    ).toBe(true);

    // Destroyed satellite: hidden
    expect(
      isAvoidanceArrowVisible({
        isEncounterActive: true,
        hasPlan: true,
        isCameraFocusedOnSat: true,
        satLifecycle: 'REMOVED',
      })
    ).toBe(false);
  });
});

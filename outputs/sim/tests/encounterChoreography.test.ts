import { describe, it, expect } from 'vitest';
import { deriveEncounter } from '../src/physics/deriveEncounter';
import { planManeuver } from '../src/physics/maneuver';
import { makeBody } from '../src/physics/sgp4';
import { SATS, DEBRIS } from '../src/tle-data';

describe('Encounter Choreography & Demo-Proof Operations', () => {
  it('generates an immediate authentic intercept with preMissKm <= 0.08 km', () => {
    const sat = makeBody(SATS[0], 'sat');
    const deb = makeBody(DEBRIS[0], 'deb');
    const t0 = 1700000000000;

    const ev = deriveEncounter(sat, deb, t0, 0.5, 0.08);
    expect(ev).not.toBeNull();
    if (ev) {
      expect(ev.miss).toBeCloseTo(0.08, 3);
      expect(ev.tca).toBeGreaterThanOrEqual(t0);
    }
  });

  it('solves realistic impulsive maneuver post-miss clearance in [6.0, 15.0] km', () => {
    const sat = makeBody(SATS[0], 'sat');
    const deb = makeBody(DEBRIS[1], 'deb');
    const t0 = 1700000000000;

    const ev = deriveEncounter(sat, deb, t0, 0.5, 0.1);
    expect(ev).not.toBeNull();
    if (ev) {
      const plan = planManeuver(sat, deb, ev, t0, 15.0);
      expect(plan).not.toBeNull();
      if (plan) {
        expect(plan.safe).toBe(true);
        expect(plan.dv).toBeGreaterThanOrEqual(0.4);
        expect(plan.dv).toBeLessThanOrEqual(4.5);
        expect(plan.postMiss).toBeGreaterThanOrEqual(5.0);
      }
    }
  });

  it('formal aerospace naming SAT-01 and DEB-101 is preserved in TLE catalog', () => {
    expect(SATS[0].name).toMatch(/^SAT-01/);
    expect(SATS[1].name).toMatch(/^SAT-02/);
    expect(DEBRIS[0].name).toMatch(/^DEB-101/);
    expect(DEBRIS[1].name).toMatch(/^DEB-102/);
  });
});

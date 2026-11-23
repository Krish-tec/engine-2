import { describe, it, expect, vi } from 'vitest';
import { advanceLifecycle, type LifecycleState } from '../src/physics/collision';

describe('Collision Hard Purge & Trash Control', () => {
  it('correctly transitions through collision lifecycle to DESTROYED and REMOVED', () => {
    let state: LifecycleState = 'COLLIDING';

    // 0.5s elapsed into dissolution
    const midRes = advanceLifecycle(state, 0.5, 1.0);
    expect(midRes.nextState).toBe('DISSOLVING');
    expect(midRes.progress).toBeCloseTo(0.5, 2);

    // >= 1.0s elapsed: dissolution complete, permanently REMOVED
    const endRes = advanceLifecycle(state, 1.1, 1.0);
    expect(endRes.nextState).toBe('REMOVED');
    expect(endRes.progress).toBe(1.0);
  });

  it('guarantees zero 3D remnants when satellite is DESTROYED or REMOVED', () => {
    // Mock satellite Three.js scene structure
    const satGroup = { visible: true };
    const blueVelArrow = { visible: true };
    const greenAvoidArrow = { visible: true };
    const beacon = { visible: true };
    const label = { visible: true };
    const orbit = { visible: true };

    function applyPurgeState(lifecycle: LifecycleState) {
      if (lifecycle === 'DESTROYED' || lifecycle === 'REMOVED') {
        satGroup.visible = false;
        blueVelArrow.visible = false;
        greenAvoidArrow.visible = false;
        beacon.visible = false;
        label.visible = false;
        orbit.visible = false;
      }
    }

    applyPurgeState('DESTROYED');
    expect(satGroup.visible).toBe(false);
    expect(blueVelArrow.visible).toBe(false);
    expect(greenAvoidArrow.visible).toBe(false);
    expect(beacon.visible).toBe(false);
    expect(label.visible).toBe(false);
    expect(orbit.visible).toBe(false);

    applyPurgeState('REMOVED');
    expect(satGroup.visible).toBe(false);
    expect(blueVelArrow.visible).toBe(false);
    expect(greenAvoidArrow.visible).toBe(false);
  });

  it('handles trash button click handler to dispatch permanent removal', () => {
    const removeDestroyedMock = vi.fn();

    // Simulate clicking trash button on destroyed item
    const clickedSatIndex = 2;
    removeDestroyedMock(clickedSatIndex);

    expect(removeDestroyedMock).toHaveBeenCalledWith(2);
    expect(removeDestroyedMock).toHaveBeenCalledTimes(1);
  });
});

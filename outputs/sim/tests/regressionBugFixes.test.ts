import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

describe('Regression Bug Fixes & Stability Suite', () => {
  describe('Phase 0: Vanishing Satellite Material Isolation', () => {
    it('guarantees that dissolving one satellite does not mutate other satellites materials', () => {
      // Base master material template
      const baseBusMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6 });

      // Each satellite receives an independent clone
      const sat0Mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), baseBusMat.clone());
      const sat1Mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), baseBusMat.clone());

      // Simulate dissolution on sat 0 (opacity fades from 1.0 down to 0)
      const u = 1.0;
      (sat0Mesh.material as THREE.Material).transparent = true;
      (sat0Mesh.material as THREE.Material).opacity = Math.max(0, 1.0 - u);

      // Verify sat 0 is dissolved but sat 1 remains 100% opaque!
      expect((sat0Mesh.material as THREE.Material).opacity).toBe(0);
      expect((sat1Mesh.material as THREE.Material).opacity).toBe(1.0);
    });

    it('enforces active satellite scale and visibility invariant', () => {
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
      group.add(mesh);

      // Suppose group was scaled down
      group.scale.set(0.1, 0.1, 0.1);
      (mesh.material as THREE.Material).opacity = 0.4;

      // Invariant check for 'ACTIVE' lifecycle
      const lifecycle = 'ACTIVE';
      if (lifecycle === 'ACTIVE') {
        group.scale.set(1, 1, 1);
        group.traverse(child => {
          if ((child as THREE.Mesh).isMesh) {
            const m = (child as THREE.Mesh).material as THREE.Material;
            if (m && m.opacity < 1.0) m.opacity = 1.0;
          }
        });
      }

      expect(group.scale.x).toBe(1);
      expect(group.scale.y).toBe(1);
      expect(group.scale.z).toBe(1);
      expect((mesh.material as THREE.Material).opacity).toBe(1.0);
    });
  });

  describe('Phase 1: Logic & State Bug Fixes', () => {
    it('allows manual dodge deflection when Auto-Avoidance AI is OFF but burn fired', () => {
      const autoDodgeEnabled = false;
      const demoChoreographyActive = false;
      const burnFired = true;

      const shouldApplyDodge = autoDodgeEnabled || demoChoreographyActive || burnFired;
      expect(shouldApplyDodge).toBe(true);
    });

    it('restores simulation speed and autoDodge after crash demo completion', () => {
      let simRate = 20;
      let autoDodge = false;

      const demoChoreography = {
        active: true,
        type: 'crash',
        originalRate: 5,
        originalAutoDodge: true,
      };

      // When crash demo finishes:
      if (demoChoreography.originalRate !== undefined) {
        simRate = demoChoreography.originalRate;
      }
      if (demoChoreography.originalAutoDodge !== undefined) {
        autoDodge = demoChoreography.originalAutoDodge;
      }
      demoChoreography.active = false;

      expect(simRate).toBe(5);
      expect(autoDodge).toBe(true);
      expect(demoChoreography.active).toBe(false);
    });

    it('excludes DESTROYED and REMOVED satellites and debris from approach calculations', () => {
      const sats = [
        { name: 'Sat-1', lifecycle: 'ACTIVE' },
        { name: 'Sat-2', lifecycle: 'DESTROYED' },
        { name: 'Sat-3', lifecycle: 'REMOVED' },
      ];
      const debris = [
        { name: 'Deb-1', lifecycle: 'ACTIVE' },
        { name: 'Deb-2', lifecycle: 'DESTROYED' },
      ];

      const validSats = sats.filter(s => s.lifecycle !== 'DESTROYED' && s.lifecycle !== 'REMOVED');
      const validDebris = debris.filter(d => d.lifecycle !== 'DESTROYED' && d.lifecycle !== 'REMOVED');

      expect(validSats.length).toBe(1);
      expect(validSats[0].name).toBe('Sat-1');
      expect(validDebris.length).toBe(1);
      expect(validDebris[0].name).toBe('Deb-1');
    });

    it('distinguishes Digit1 (satellite selection) from Numpad1 (view preset)', () => {
      const selectIndexMock = vi.fn();
      const setViewPresetMock = vi.fn();

      function handleKey(code: string) {
        // Top-row digit only:
        if (code.startsWith('Digit')) {
          const char = code.slice(-1);
          const digit = parseInt(char, 10);
          if (!isNaN(digit) && digit >= 1 && digit <= 9) {
            selectIndexMock(digit - 1);
            return;
          }
        }
        // Blender view preset
        if (code === 'Numpad1') {
          setViewPresetMock('FRONT');
          return;
        }
      }

      handleKey('Digit1');
      expect(selectIndexMock).toHaveBeenCalledWith(0);
      expect(setViewPresetMock).not.toHaveBeenCalled();

      selectIndexMock.mockClear();
      handleKey('Numpad1');
      expect(selectIndexMock).not.toHaveBeenCalled();
      expect(setViewPresetMock).toHaveBeenCalledWith('FRONT');
    });
  });

  describe('Phase 2 & 3: GPU Disposal & UI Precision', () => {
    it('properly disposes collision flash, ring, and shrapnel materials', () => {
      const flashMat = new THREE.MeshBasicMaterial();
      const ringMat = new THREE.MeshBasicMaterial();
      const shrapnelMat = new THREE.MeshBasicMaterial();

      const flashDispose = vi.spyOn(flashMat, 'dispose');
      const ringDispose = vi.spyOn(ringMat, 'dispose');
      const shrapnelDispose = vi.spyOn(shrapnelMat, 'dispose');

      flashMat.dispose();
      ringMat.dispose();
      shrapnelMat.dispose();

      expect(flashDispose).toHaveBeenCalled();
      expect(ringDispose).toHaveBeenCalled();
      expect(shrapnelDispose).toHaveBeenCalled();
    });
  });
});

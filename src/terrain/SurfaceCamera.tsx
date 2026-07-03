import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, type PerspectiveCamera } from 'three';
import { useStore } from '../store';

const _target = new Vector3();
// Close in on the ~1.2-unit ship so it reads as a vehicle on textured ground.
const SURFACE_HEIGHT = 1.5;
const CAM_DISTANCE = 6;

/** Edge-state for the Phase 8 surface-mode gamepad actions. */
const surfacePadPrev = { disembark: false, launch: false };

/**
 * Phase 8 surface-mode gamepad actions (edge-triggered):
 *   A (0) — Disembark (step onto the voxel surface on foot)
 *   B (1) — Launch (return to flight)
 * Mirrors the on-foot pad (A act / B back) so the mapping stays consistent.
 */
function pollSurfaceGamepad(store: ReturnType<typeof useStore.getState>) {
  const pads = navigator.getGamepads?.();
  if (!pads) return;
  let gp: Gamepad | null = null;
  for (const p of pads) {
    if (p) {
      gp = p;
      break;
    }
  }
  if (!gp) {
    surfacePadPrev.disembark = surfacePadPrev.launch = false;
    return;
  }
  const aDown = !!gp.buttons[0]?.pressed;
  if (aDown && !surfacePadPrev.disembark) store.disembark();
  surfacePadPrev.disembark = aDown;

  const bDown = !!gp.buttons[1]?.pressed;
  if (bDown && !surfacePadPrev.launch) store.beginAscent();
  surfacePadPrev.launch = bDown;
}

export function SurfaceCamera() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const initialized = useRef(false);

  useEffect(() => {
    camera.near = 0.1;
    camera.far = 2000;
    // Was hardcoded to 70, silently overriding the user's FOV setting every
    // time this (pre-disembark) surface view is entered.
    camera.fov = useStore.getState().fov;
    camera.updateProjectionMatrix();
  }, [camera]);

  useFrame(() => {
    const store = useStore.getState();
    if (store.sceneMode.type !== 'surface') {
      initialized.current = false;
      return;
    }

    pollSurfaceGamepad(store);

    const [px, py, pz] = store.shipPosition;
    _target.set(px, py + SURFACE_HEIGHT, pz);

    if (!initialized.current) {
      camera.position.set(px + CAM_DISTANCE * 0.5, py + SURFACE_HEIGHT + 3, pz + CAM_DISTANCE);
      initialized.current = true;
    }

    camera.lookAt(_target);
    camera.updateProjectionMatrix();
  });

  return null;
}

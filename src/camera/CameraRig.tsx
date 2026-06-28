import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Vector3, type PerspectiveCamera } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useStore } from '../store';
import { WORLD_SCALE } from '../systems/bodies';

const DEFAULT_POS = new Vector3(0, 400, 1200).multiplyScalar(WORLD_SCALE);
const DEFAULT_TARGET = new Vector3(0, 0, 0);
const INTRO_POS = new Vector3(0, 2000, 4500).multiplyScalar(WORLD_SCALE);

const DEFAULT_FOV = 75;
const FOCUS_FOV = 62; // subtle dolly-in when framing a body
const INTRO_FOV = 92;

const easeCubicInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

type Mode = 'intro' | 'focusing' | 'following' | 'resetting' | 'idle';

/**
 * Cinematic camera: an intro fly-in, eased framed-focus transitions that home
 * onto the (moving) target, follow-cam that tracks a body's orbital translation
 * while leaving the user free to orbit/zoom, a return-to-overview reset, and a
 * subtle FOV dolly. Driven by store focus state.
 */
export function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;

  const focusObject = useStore((s) => s.focusObject);
  const resetCounter = useStore((s) => s.resetCounter);

  const mode = useRef<Mode>('idle');
  const start = useRef(0);
  const duration = useRef(0);
  const fromPos = useRef(new Vector3());
  const toPos = useRef(new Vector3());
  const fromTarget = useRef(new Vector3());
  const toTarget = useRef(new Vector3());
  const camDir = useRef(new Vector3());
  const focusDist = useRef(50);
  const fromFov = useRef(DEFAULT_FOV);
  const toFov = useRef(DEFAULT_FOV);
  const followPrev = useRef(new Vector3());
  const tmp = useRef(new Vector3());

  // Cinematic intro fly-in (once, on mount) — skipped under reduced motion.
  useEffect(() => {
    if (useStore.getState().reducedMotion) {
      camera.position.copy(DEFAULT_POS);
      camera.fov = DEFAULT_FOV;
      camera.updateProjectionMatrix();
      return;
    }
    camera.position.copy(INTRO_POS);
    camera.fov = INTRO_FOV;
    camera.updateProjectionMatrix();
    fromPos.current.copy(INTRO_POS);
    toPos.current.copy(DEFAULT_POS);
    fromTarget.current.copy(DEFAULT_TARGET);
    toTarget.current.copy(DEFAULT_TARGET);
    fromFov.current = INTRO_FOV;
    toFov.current = DEFAULT_FOV;
    duration.current = 3800;
    start.current = performance.now();
    mode.current = 'intro';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Begin a framed-focus transition whenever a body is selected.
  useEffect(() => {
    if (!focusObject || !controls.current) return;
    const geom = (
      focusObject as { geometry?: { boundingSphere?: { radius: number } | null; computeBoundingSphere?: () => void } }
    ).geometry;
    geom?.computeBoundingSphere?.();
    const size = geom?.boundingSphere?.radius ?? 5;
    camera.getWorldDirection(camDir.current); // viewing direction, kept for the framing offset
    focusDist.current = Math.max(size * (size > 5 ? 3 : 5), 18);

    fromPos.current.copy(camera.position);
    fromTarget.current.copy(controls.current.target);
    fromFov.current = camera.fov;
    toFov.current = FOCUS_FOV;
    duration.current = useStore.getState().reducedMotion ? 1 : 1500;
    start.current = performance.now();
    mode.current = 'focusing';
  }, [focusObject, camera]);

  // Return to the system overview on reset (skip the initial mount).
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (!controls.current) return;
    fromPos.current.copy(camera.position);
    fromTarget.current.copy(controls.current.target);
    toPos.current.copy(DEFAULT_POS);
    toTarget.current.copy(DEFAULT_TARGET);
    fromFov.current = camera.fov;
    toFov.current = DEFAULT_FOV;
    duration.current = 1200;
    start.current = performance.now();
    mode.current = 'resetting';
  }, [resetCounter, camera]);

  useFrame(() => {
    const c = controls.current;
    if (!c) return;
    const m = mode.current;

    if (m === 'focusing' || m === 'intro' || m === 'resetting') {
      const t = Math.min((performance.now() - start.current) / duration.current, 1);
      const e = easeCubicInOut(t);

      if (m === 'focusing' && focusObject) {
        // Home onto the body's *current* position so fast time-scales still land.
        const bodyPos = focusObject.getWorldPosition(tmp.current);
        toTarget.current.copy(bodyPos);
        toPos.current.copy(bodyPos).addScaledVector(camDir.current, -focusDist.current);
      }
      camera.position.lerpVectors(fromPos.current, toPos.current, e);
      c.target.lerpVectors(fromTarget.current, toTarget.current, e);
      camera.fov = fromFov.current + (toFov.current - fromFov.current) * e;
      camera.updateProjectionMatrix();

      if (t >= 1) {
        if (m === 'focusing' && focusObject) {
          focusObject.getWorldPosition(followPrev.current);
          mode.current = 'following';
        } else {
          mode.current = 'idle';
        }
      }
    } else if (m === 'following' && focusObject) {
      // Move the camera and target by the body's per-frame translation, so it
      // stays framed while the user is still free to orbit/zoom around it.
      const bodyPos = focusObject.getWorldPosition(tmp.current);
      const dx = bodyPos.x - followPrev.current.x;
      const dy = bodyPos.y - followPrev.current.y;
      const dz = bodyPos.z - followPrev.current.z;
      camera.position.x += dx;
      camera.position.y += dy;
      camera.position.z += dz;
      c.target.x += dx;
      c.target.y += dy;
      c.target.z += dz;
      followPrev.current.copy(bodyPos);
    }

    c.update();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.05}
      minDistance={5}
      maxDistance={6000 * WORLD_SCALE}
    />
  );
}

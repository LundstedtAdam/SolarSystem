import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useStore } from '../store';

const DEFAULT_POS = new Vector3(0, 200, 500);
const DEFAULT_TARGET = new Vector3(0, 0, 0);

const easeCubicInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeQuadInOut = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

type Mode = 'idle' | 'focusing' | 'following' | 'resetting';

/**
 * Camera controller that reproduces the legacy feel: damped OrbitControls, a
 * 1.5s eased zoom-to-body on selection that then follows the moving body, and a
 * 1s eased return to the default view on reset.
 */
export function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera);

  const focusObject = useStore((s) => s.focusObject);
  const resetCounter = useStore((s) => s.resetCounter);

  const mode = useRef<Mode>('idle');
  const start = useRef(0);
  const duration = useRef(0);
  const fromPos = useRef(new Vector3());
  const toPos = useRef(new Vector3());
  const fromTarget = useRef(new Vector3());
  const toTarget = useRef(new Vector3());

  // Begin a focus transition whenever a body is selected.
  useEffect(() => {
    if (!focusObject || !controls.current) return;
    const size = useStore.getState().selected?.size ?? 5;
    const dir = new Vector3();
    camera.getWorldDirection(dir);
    const planetPos = focusObject.getWorldPosition(new Vector3());
    const sizeFactor = size > 5 ? 3 : 5;
    const distance = Math.max(size * sizeFactor, 20);

    fromPos.current.copy(camera.position);
    fromTarget.current.copy(controls.current.target);
    toPos.current.copy(planetPos).sub(dir.multiplyScalar(distance));
    toTarget.current.copy(planetPos);
    duration.current = 1500;
    start.current = performance.now();
    mode.current = 'focusing';
  }, [focusObject, camera]);

  // Begin a reset transition when the user asks to reset (skip first mount).
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
    duration.current = 1000;
    start.current = performance.now();
    mode.current = 'resetting';
  }, [resetCounter, camera]);

  useFrame(() => {
    const c = controls.current;
    if (!c) return;

    if (mode.current === 'focusing' || mode.current === 'resetting') {
      const t = Math.min((performance.now() - start.current) / duration.current, 1);
      const e = mode.current === 'focusing' ? easeCubicInOut(t) : easeQuadInOut(t);
      camera.position.lerpVectors(fromPos.current, toPos.current, e);
      c.target.lerpVectors(fromTarget.current, toTarget.current, e);
      if (t >= 1) mode.current = mode.current === 'focusing' ? 'following' : 'idle';
    } else if (mode.current === 'following' && focusObject) {
      // Track the moving body without overriding the user's orbit.
      focusObject.getWorldPosition(c.target);
    }

    c.update();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.05}
      minDistance={50}
      maxDistance={2000}
    />
  );
}

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, Quaternion, type PerspectiveCamera } from 'three';
import { useStore } from '../store';
import {
  resolveDescentTarget,
  ORBIT_DURATION,
  ATMOSPHERE_DURATION,
  LANDING_DURATION,
  GAS_GIANT_ABORT_DELAY,
} from './descentHelpers';

const easeCubicInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const _shipPos = new Vector3();
const _targetPos = new Vector3();
const _camPos = new Vector3();
const _lookAt = new Vector3();
const _offset = new Vector3();
const _quat = new Quaternion();

const SHAKE_FREQ = 12;
const SHAKE_MAX = 0.4;

export function DescentCamera() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const phaseTimer = useRef(0);
  const lastPhase = useRef('');

  useFrame((_, delta) => {
    const store = useStore.getState();
    if (store.sceneMode.type !== 'descending') {
      phaseTimer.current = 0;
      lastPhase.current = '';
      return;
    }

    const dt = Math.min(delta, 0.05);
    const mode = store.sceneMode;

    if (mode.phase !== lastPhase.current) {
      phaseTimer.current = 0;
      lastPhase.current = mode.phase;
    }
    phaseTimer.current += dt;

    const resolved = resolveDescentTarget(mode.target, store.simTimeDays);
    if (!resolved) return;

    _shipPos.set(...store.shipPosition);
    _targetPos.copy(resolved.worldPos);
    _quat.set(...store.shipRotation);

    const isGasGiant = resolved.isGasGiant;
    const duration = isGasGiant
      ? GAS_GIANT_ABORT_DELAY
      : mode.phase === 'orbit'
        ? ORBIT_DURATION
        : mode.phase === 'atmosphere'
          ? ATMOSPHERE_DURATION
          : LANDING_DURATION;

    const progress = Math.min(phaseTimer.current / duration, 1);

    switch (mode.phase) {
      case 'orbit':
        cameraOrbit(progress, resolved.size);
        break;
      case 'atmosphere':
        cameraAtmosphere(progress, resolved.size, resolved.hasAtmosphere);
        break;
      case 'landing':
        cameraLanding(progress, resolved.size);
        break;
    }

    if (isGasGiant) {
      cameraOrbit(progress, resolved.size);
    }
  });

  function cameraOrbit(progress: number, bodySize: number) {
    const eased = easeCubicInOut(progress);
    const pullBack = 8 + eased * bodySize * 2;

    _offset.set(3, 4, pullBack).applyQuaternion(_quat);
    _camPos.copy(_shipPos).add(_offset);
    camera.position.lerp(_camPos, 0.06);

    _lookAt.lerpVectors(_shipPos, _targetPos, eased * 0.5);
    camera.lookAt(_lookAt);

    // Base is the player's FOV setting (was a hardcoded 75, silently ignoring
    // it); the cinematic narrowing during the phase is an offset from that base.
    camera.fov = useStore.getState().fov - eased * 10;
    camera.updateProjectionMatrix();
  }

  function cameraAtmosphere(progress: number, _bodySize: number, hasAtmosphere: boolean) {
    const eased = easeCubicInOut(progress);

    _offset.set(2 - eased, 2 + eased * 2, 6 - eased * 2).applyQuaternion(_quat);
    _camPos.copy(_shipPos).add(_offset);

    if (hasAtmosphere && progress > 0.1 && progress < 0.9) {
      const shakeIntensity = SHAKE_MAX * Math.sin(progress * Math.PI);
      const time = phaseTimer.current * SHAKE_FREQ;
      _camPos.x += Math.sin(time * 1.3) * shakeIntensity;
      _camPos.y += Math.cos(time * 1.7) * shakeIntensity;
      _camPos.z += Math.sin(time * 0.9) * shakeIntensity * 0.5;
    }

    camera.position.lerp(_camPos, 0.08);

    _lookAt.lerpVectors(_shipPos, _targetPos, 0.3 + eased * 0.4);
    camera.lookAt(_lookAt);

    // Starts exactly where the orbit phase left off (base - 10) for a seamless
    // handoff, then ramps up for the reentry speed sensation.
    camera.fov = useStore.getState().fov - 10 + eased * 15;
    camera.updateProjectionMatrix();
  }

  function cameraLanding(progress: number, _bodySize: number) {
    const eased = easeCubicInOut(progress);

    _offset.set(
      3 * Math.cos(eased * Math.PI * 0.5),
      3 + (1 - eased) * 4,
      3 * Math.sin(eased * Math.PI * 0.5) + 4,
    ).applyQuaternion(_quat);
    _camPos.copy(_shipPos).add(_offset);

    camera.position.lerp(_camPos, 0.06);
    camera.lookAt(_shipPos);

    camera.fov = useStore.getState().fov - eased * 5;
    camera.near = 1 - eased * 0.9;
    camera.far = 50000 - eased * 48000;
    camera.updateProjectionMatrix();
  }

  return null;
}

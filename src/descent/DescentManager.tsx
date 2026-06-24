import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Quaternion } from 'three';
import { useStore } from '../store';
import {
  resolveDescentTarget,
  ORBIT_DURATION,
  ATMOSPHERE_DURATION,
  LANDING_DURATION,
  GAS_GIANT_ABORT_DELAY,
  type DescentTarget,
} from './descentHelpers';
import { setHeatIntensity } from './descentUniforms';

const easeCubicInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const _shipPos = new Vector3();
const _targetPos = new Vector3();
const _dir = new Vector3();
const _quat = new Quaternion();

export function DescentManager() {
  const phaseTimer = useRef(0);
  const target = useRef<DescentTarget | null>(null);
  const startPos = useRef(new Vector3());
  const gasGiantAbortTimer = useRef(0);

  useFrame((_, delta) => {
    const store = useStore.getState();
    if (store.sceneMode.type !== 'descending') {
      phaseTimer.current = 0;
      target.current = null;
      gasGiantAbortTimer.current = 0;
      setHeatIntensity(0);
      return;
    }

    const dt = Math.min(delta, 0.05);
    const mode = store.sceneMode;

    if (!target.current) {
      target.current = resolveDescentTarget(mode.target, store.simTimeDays);
      if (!target.current) {
        store.abortDescent();
        return;
      }
      startPos.current.set(...store.shipPosition);
      phaseTimer.current = 0;
      gasGiantAbortTimer.current = 0;
    }

    const resolved = resolveDescentTarget(mode.target, store.simTimeDays);
    if (resolved) {
      target.current.worldPos.copy(resolved.worldPos);
    }

    phaseTimer.current += dt;

    if (target.current.isGasGiant) {
      handleGasGiantAbort(store, dt);
      return;
    }

    switch (mode.phase) {
      case 'orbit':
        handleOrbitPhase(store, mode);
        break;
      case 'atmosphere':
        handleAtmospherePhase(store, mode);
        break;
      case 'landing':
        handleLandingPhase(store, mode);
        break;
    }
  });

  function handleGasGiantAbort(
    store: ReturnType<typeof useStore.getState>,
    dt: number,
  ) {
    gasGiantAbortTimer.current += dt;
    const t = target.current!;

    const progress = Math.min(phaseTimer.current / GAS_GIANT_ABORT_DELAY, 1);
    const eased = easeCubicInOut(progress);

    _shipPos.set(...store.shipPosition);
    _targetPos.copy(t.worldPos);
    const approachDist = t.size * 2;
    _dir.copy(_targetPos).sub(startPos.current).normalize();
    const dest = _targetPos.clone().sub(_dir.multiplyScalar(approachDist));

    _shipPos.lerpVectors(startPos.current, dest, eased);

    orientToward(_shipPos, _targetPos);
    store.setShipPosition([_shipPos.x, _shipPos.y, _shipPos.z]);
    store.setShipRotation([_quat.x, _quat.y, _quat.z, _quat.w]);
    store.setShipVelocity([0, 0, 0]);

    if (gasGiantAbortTimer.current >= GAS_GIANT_ABORT_DELAY) {
      store.abortDescent();
    }
  }

  function handleOrbitPhase(
    store: ReturnType<typeof useStore.getState>,
    _mode: { target: string; phase: string },
  ) {
    const t = target.current!;
    const progress = Math.min(phaseTimer.current / ORBIT_DURATION, 1);
    const eased = easeCubicInOut(progress);

    _targetPos.copy(t.worldPos);
    const approachDist = t.size * 4;
    _dir.copy(_targetPos).sub(startPos.current).normalize();
    const orbitPoint = _targetPos.clone().sub(_dir.multiplyScalar(approachDist));

    _shipPos.lerpVectors(startPos.current, orbitPoint, eased);

    orientToward(_shipPos, _targetPos);
    store.setShipPosition([_shipPos.x, _shipPos.y, _shipPos.z]);
    store.setShipRotation([_quat.x, _quat.y, _quat.z, _quat.w]);
    store.setShipVelocity([0, 0, 0]);

    if (progress >= 1) {
      phaseTimer.current = 0;
      startPos.current.copy(_shipPos);
      store.setDescentPhase('atmosphere');
    }
  }

  function handleAtmospherePhase(
    store: ReturnType<typeof useStore.getState>,
    _mode: { target: string; phase: string },
  ) {
    const t = target.current!;
    const progress = Math.min(phaseTimer.current / ATMOSPHERE_DURATION, 1);
    const eased = easeCubicInOut(progress);

    const heatCurve = t.hasAtmosphere ? Math.sin(progress * Math.PI) : 0;
    setHeatIntensity(heatCurve * t.atmosphereIntensity);

    _targetPos.copy(t.worldPos);
    const surfaceDist = t.size * 1.5;
    _dir.copy(_targetPos).sub(startPos.current).normalize();
    const surfacePoint = _targetPos.clone().sub(_dir.multiplyScalar(surfaceDist));

    _shipPos.lerpVectors(startPos.current, surfacePoint, eased);

    orientToward(_shipPos, _targetPos);
    store.setShipPosition([_shipPos.x, _shipPos.y, _shipPos.z]);
    store.setShipRotation([_quat.x, _quat.y, _quat.z, _quat.w]);
    store.setShipVelocity([0, 0, 0]);

    if (progress >= 1) {
      phaseTimer.current = 0;
      startPos.current.copy(_shipPos);
      store.setDescentPhase('landing');
    }
  }

  function handleLandingPhase(
    store: ReturnType<typeof useStore.getState>,
    mode: { target: string; phase: string },
  ) {
    setHeatIntensity(0);
    const t = target.current!;
    const progress = Math.min(phaseTimer.current / LANDING_DURATION, 1);
    const eased = easeCubicInOut(progress);

    _targetPos.copy(t.worldPos);
    const surfaceDist = t.size * 1.05;
    _dir.copy(_targetPos).sub(startPos.current).normalize();
    const landingPoint = _targetPos.clone().sub(_dir.multiplyScalar(surfaceDist));

    _shipPos.lerpVectors(startPos.current, landingPoint, eased);

    orientToward(_shipPos, _targetPos);
    store.setShipPosition([_shipPos.x, _shipPos.y, _shipPos.z]);
    store.setShipRotation([_quat.x, _quat.y, _quat.z, _quat.w]);
    store.setShipVelocity([0, 0, 0]);

    if (progress >= 1) {
      store.completeLanding(mode.target);
    }
  }

  function orientToward(from: Vector3, to: Vector3) {
    _dir.copy(to).sub(from).normalize();
    const up = new Vector3(0, 1, 0);
    const right = new Vector3().crossVectors(up, _dir).normalize();
    up.crossVectors(_dir, right);
    const m00 = right.x, m01 = up.x, m02 = _dir.x;
    const m10 = right.y, m11 = up.y, m12 = _dir.y;
    const m20 = right.z, m21 = up.z, m22 = _dir.z;
    const trace = m00 + m11 + m22;
    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1);
      _quat.set((m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s);
    } else if (m00 > m11 && m00 > m22) {
      const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
      _quat.set(0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s);
    } else if (m11 > m22) {
      const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
      _quat.set((m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s);
    } else {
      const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
      _quat.set((m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s);
    }
    _quat.normalize();
  }

  return null;
}

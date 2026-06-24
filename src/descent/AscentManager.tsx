import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useStore } from '../store';
import { resolveDescentTarget } from './descentHelpers';

const ASCENT_DURATION = 4.0;

const easeCubicInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const _shipPos = new Vector3();
const _targetPos = new Vector3();
const _dir = new Vector3();

export function AscentManager() {
  const timer = useRef(0);
  const startPos = useRef(new Vector3());
  const initialized = useRef(false);

  useFrame((_, delta) => {
    const store = useStore.getState();
    if (store.sceneMode.type !== 'ascending') {
      timer.current = 0;
      initialized.current = false;
      return;
    }

    const dt = Math.min(delta, 0.05);

    if (!initialized.current) {
      startPos.current.set(...store.shipPosition);
      initialized.current = true;
      timer.current = 0;
    }

    timer.current += dt;
    const progress = Math.min(timer.current / ASCENT_DURATION, 1);
    const eased = easeCubicInOut(progress);

    const resolved = resolveDescentTarget(store.sceneMode.planet, store.simTimeDays);
    if (!resolved) {
      store.completeAscent();
      return;
    }

    _targetPos.copy(resolved.worldPos);
    _dir.copy(startPos.current).sub(_targetPos).normalize();
    const liftoffPoint = _targetPos.clone().add(_dir.multiplyScalar(resolved.size * 5));

    _shipPos.lerpVectors(startPos.current, liftoffPoint, eased);

    store.setShipPosition([_shipPos.x, _shipPos.y, _shipPos.z]);
    store.setShipVelocity([0, 0, 0]);

    if (progress >= 1) {
      store.completeAscent();
    }
  });

  return null;
}

import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Quaternion, Vector3 } from 'three';
import { useStore } from '../store';
import { PLANETS } from '../systems/bodies';
import { positionAtTime } from '../systems/ephemeris';
import {
  applyRotation,
  computeThrust,
  computeGravity,
  integrate,
  type GravityBody,
} from './shipPhysics';
import { readInput, installKeyboardListeners, removeKeyboardListeners } from './shipInput';
import { ShipModel } from './ShipModel';

const _pos = new Vector3();
const _vel = new Vector3();
const _accel = new Vector3();
const _quat = new Quaternion();
const _bodyPos = new Vector3();

export function ShipController() {
  const groupRef = useRef<Group>(null);
  const bodies = useRef<GravityBody[]>([]);

  useEffect(() => {
    installKeyboardListeners();
    return () => removeKeyboardListeners();
  }, []);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const store = useStore.getState();
    if (store.sceneMode.type !== 'piloting') return;

    const dt = Math.min(delta, 0.05);

    const [px, py, pz] = store.shipPosition;
    const [vx, vy, vz] = store.shipVelocity;
    const [qx, qy, qz, qw] = store.shipRotation;

    _pos.set(px, py, pz);
    _vel.set(vx, vy, vz);
    _quat.set(qx, qy, qz, qw);

    const input = readInput();
    applyRotation(_quat, input, dt);

    _accel.set(0, 0, 0);
    const thrust = computeThrust(_quat, input.thrust);
    _accel.add(thrust);

    bodies.current.length = 0;
    const simTime = store.simTimeDays;
    for (const p of PLANETS) {
      positionAtTime(p.elements, p.distance, simTime, _bodyPos);
      bodies.current.push({ position: _bodyPos.clone(), size: p.size });
    }
    const grav = computeGravity(_pos, bodies.current);
    _accel.add(grav);

    integrate(_pos, _vel, _accel, dt);

    group.position.copy(_pos);
    group.quaternion.copy(_quat);

    store.setShipPosition([_pos.x, _pos.y, _pos.z]);
    store.setShipVelocity([_vel.x, _vel.y, _vel.z]);
    store.setShipRotation([_quat.x, _quat.y, _quat.z, _quat.w]);
    store.setShipThrottle(Math.abs(input.thrust));
  });

  const [px, py, pz] = useStore((s) => s.shipPosition);

  return (
    <group ref={groupRef} position={[px, py, pz]}>
      <ShipModel />
    </group>
  );
}

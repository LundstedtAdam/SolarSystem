import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, Quaternion, type PerspectiveCamera } from 'three';
import { useStore } from '../store';

const CHASE_OFFSET = new Vector3(0, 3, 10);
const LOOK_AHEAD = new Vector3(0, 1, -15);
const FOLLOW_FACTOR = 0.04;
const DEFAULT_FOV = 75;
const MIN_FOV = 62;
const MAX_SPEED_FOR_FOV = 200;

const _desired = new Vector3();
const _lookAt = new Vector3();
const _shipPos = new Vector3();
const _quat = new Quaternion();
const _offset = new Vector3();

export function ShipCamera() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const initialized = useRef(false);

  useFrame(() => {
    const store = useStore.getState();
    if (store.sceneMode.type !== 'piloting') return;

    const [px, py, pz] = store.shipPosition;
    const [vx, vy, vz] = store.shipVelocity;
    const [qx, qy, qz, qw] = store.shipRotation;

    _shipPos.set(px, py, pz);
    _quat.set(qx, qy, qz, qw);

    _offset.copy(CHASE_OFFSET).applyQuaternion(_quat);
    _desired.copy(_shipPos).add(_offset);

    _offset.copy(LOOK_AHEAD).applyQuaternion(_quat);
    _lookAt.copy(_shipPos).add(_offset);

    if (!initialized.current) {
      camera.position.copy(_desired);
      initialized.current = true;
    } else {
      camera.position.lerp(_desired, FOLLOW_FACTOR);
    }
    camera.lookAt(_lookAt);

    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
    const fovT = Math.min(speed / MAX_SPEED_FOR_FOV, 1);
    camera.fov = DEFAULT_FOV - (DEFAULT_FOV - MIN_FOV) * fovT;
    camera.updateProjectionMatrix();
  });

  return null;
}

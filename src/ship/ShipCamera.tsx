import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, Quaternion, type PerspectiveCamera } from 'three';
import { useStore } from '../store';
import {
  decayCameraLook,
  getCameraLook,
  addCameraLook,
  endCameraLook,
  resetCameraLook,
} from './cameraLook';

// Scaled to the ~1.2-unit ship: close enough that the craft reads clearly while
// planets (radius 2-28) loom massive behind it and grow as you approach.
const CHASE_OFFSET = new Vector3(0, 0.7, 2.8);
const LOOK_AHEAD = new Vector3(0, 0.25, -6);
const FOLLOW_FACTOR = 0.04;
const DEFAULT_FOV = 75;
const MIN_FOV = 62;
const MAX_SPEED_FOR_FOV = 500;

const _desired = new Vector3();
const _lookAt = new Vector3();
const _shipPos = new Vector3();
const _quat = new Quaternion();
const _offset = new Vector3();
const _ahead = new Vector3();
const _orbit = new Quaternion();
const _qYaw = new Quaternion();
const _qPitch = new Quaternion();
const _up = new Vector3(0, 1, 0);
const _right = new Vector3(1, 0, 0);

export function ShipCamera() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const initialized = useRef(false);

  // Desktop: Pointer Lock mouse-look orbits the chase camera with raw,
  // un-accelerated deltas. Touch devices use the drag layer instead.
  useEffect(() => {
    resetCameraLook();
    initialized.current = false;

    const canvas = gl.domElement;
    const isCoarse =
      typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    if (isCoarse) return () => resetCameraLook();

    const onClick = () => {
      if (
        useStore.getState().sceneMode.type === 'piloting' &&
        document.pointerLockElement !== canvas
      ) {
        // unadjustedMovement skips OS pointer acceleration where supported.
        try {
          (canvas.requestPointerLock as (opts?: { unadjustedMovement: boolean }) => void)({
            unadjustedMovement: true,
          });
        } catch {
          canvas.requestPointerLock();
        }
      }
    };
    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement === canvas) addCameraLook(e.movementX, e.movementY);
    };
    const onLockChange = () => {
      if (document.pointerLockElement !== canvas) endCameraLook();
    };

    canvas.addEventListener('click', onClick);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('pointerlockchange', onLockChange);
    return () => {
      canvas.removeEventListener('click', onClick);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('pointerlockchange', onLockChange);
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
      resetCameraLook();
    };
  }, [gl]);

  useFrame((_, delta) => {
    const store = useStore.getState();
    if (store.sceneMode.type !== 'piloting') return;

    const [px, py, pz] = store.shipPosition;
    const [vx, vy, vz] = store.shipVelocity;
    const [qx, qy, qz, qw] = store.shipRotation;

    _shipPos.set(px, py, pz);
    _quat.set(qx, qy, qz, qw);

    decayCameraLook(delta);
    const look = getCameraLook();

    // Orbit the chase offset around the ship in its local frame (yaw about the
    // ship's up, pitch about its right), then bring it into world space.
    _qYaw.setFromAxisAngle(_up, look.yaw);
    _qPitch.setFromAxisAngle(_right, look.pitch);
    _orbit.copy(_qYaw).multiply(_qPitch);

    _offset.copy(CHASE_OFFSET).applyQuaternion(_orbit).applyQuaternion(_quat);
    _desired.copy(_shipPos).add(_offset);

    // When orbiting, frame the ship itself; when centered, lead slightly ahead.
    const orbitMag = Math.min(1, (Math.abs(look.yaw) + Math.abs(look.pitch)) / 1.2);
    _ahead.copy(LOOK_AHEAD).applyQuaternion(_quat).multiplyScalar(1 - orbitMag);
    _lookAt.copy(_shipPos).add(_ahead);

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

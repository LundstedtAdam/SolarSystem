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
/** Exponential approach rate (1/s) for correcting toward the ideal framing.
 *  Distance is held by velocity compensation, so this only absorbs orbit/offset
 *  drift — the ship no longer outruns the camera at high thrust. */
const FOLLOW_RATE = 6;
const DEFAULT_FOV = 75;
const MIN_FOV = 68; // gentle speed-based zoom (was 62 — too aggressive)
const MAX_SPEED_FOR_FOV = 500;
/** Subtle extra chase distance at full throttle — a hint of pull-back, no more. */
const THROTTLE_ZOOM = 0.12;
/** Peak camera jitter (world units) at 100% throttle. */
const SHAKE_AMP = 0.14;

const _desired = new Vector3();
const _lookAt = new Vector3();
const _shipPos = new Vector3();
const _quat = new Quaternion();
const _offset = new Vector3();
const _ahead = new Vector3();
const _shipDelta = new Vector3();
const _orbit = new Quaternion();
const _qYaw = new Quaternion();
const _qPitch = new Quaternion();
const _up = new Vector3(0, 1, 0);
const _right = new Vector3(1, 0, 0);

export function ShipCamera() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const initialized = useRef(false);
  const camBase = useRef(new Vector3());
  const prevShip = useRef(new Vector3());

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

  useFrame((state, delta) => {
    const store = useStore.getState();
    if (store.sceneMode.type !== 'piloting') return;

    const [px, py, pz] = store.shipPosition;
    const [vx, vy, vz] = store.shipVelocity;
    const [qx, qy, qz, qw] = store.shipRotation;
    const throttle = store.shipThrottle; // raw lever position 0..1

    _shipPos.set(px, py, pz);
    _quat.set(qx, qy, qz, qw);

    decayCameraLook(delta);
    const look = getCameraLook();

    // Orbit the chase offset around the ship in its local frame (yaw about the
    // ship's up, pitch about its right), then bring it into world space. A small
    // throttle-scaled zoom adds a subtle pull-back at high power.
    _qYaw.setFromAxisAngle(_up, look.yaw);
    _qPitch.setFromAxisAngle(_right, look.pitch);
    _orbit.copy(_qYaw).multiply(_qPitch);

    _offset
      .copy(CHASE_OFFSET)
      .multiplyScalar(1 + THROTTLE_ZOOM * throttle)
      .applyQuaternion(_orbit)
      .applyQuaternion(_quat);
    _desired.copy(_shipPos).add(_offset);

    // When orbiting, frame the ship itself; when centered, lead slightly ahead.
    const orbitMag = Math.min(1, (Math.abs(look.yaw) + Math.abs(look.pitch)) / 1.2);
    _ahead.copy(LOOK_AHEAD).applyQuaternion(_quat).multiplyScalar(1 - orbitMag);
    _lookAt.copy(_shipPos).add(_ahead);

    if (!initialized.current) {
      camBase.current.copy(_desired);
      prevShip.current.copy(_shipPos);
      initialized.current = true;
    } else {
      // Velocity compensation: rigidly translate by the ship's motion so high
      // thrust never lets the ship outrun the camera (no recede), then ease the
      // residual toward the ideal framing to absorb orbit/offset changes.
      camBase.current.add(_shipDelta.copy(_shipPos).sub(prevShip.current));
      camBase.current.lerp(_desired, 1 - Math.exp(-FOLLOW_RATE * delta));
      prevShip.current.copy(_shipPos);
    }
    camera.position.copy(camBase.current);

    // Last-quarter (75–100% throttle) screen shake, smooth 0 -> full.
    const q = Math.min(Math.max((throttle - 0.75) / 0.25, 0), 1);
    const shakeT = q * q * (3 - 2 * q); // smoothstep
    if (shakeT > 0 && !store.reducedMotion) {
      const t = state.clock.elapsedTime;
      const a = SHAKE_AMP * shakeT;
      camera.position.x += (Math.sin(t * 46) + 0.5 * Math.sin(t * 79)) * a;
      camera.position.y += (Math.cos(t * 53) + 0.5 * Math.sin(t * 97)) * a;
    }

    camera.lookAt(_lookAt);

    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
    const fovT = Math.min(speed / MAX_SPEED_FOR_FOV, 1);
    camera.fov = DEFAULT_FOV - (DEFAULT_FOV - MIN_FOV) * fovT;
    camera.updateProjectionMatrix();
  });

  return null;
}

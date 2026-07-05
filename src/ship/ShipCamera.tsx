import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, Quaternion, MathUtils, type PerspectiveCamera } from 'three';
import { useStore } from '../store';
import { shipTelemetry } from './shipTelemetry';
import { PLANETS } from '../systems/bodies';
import { positionAtTime } from '../systems/ephemeris';
import {
  decayCameraLook,
  getCameraLook,
  addCameraLook,
  endCameraLook,
  resetCameraLook,
} from './cameraLook';
import { addStickInput } from './virtualStick';

// Scaled to the ~1.2-unit ship: close enough that the craft reads clearly while
// planets (radius 2-28) loom massive behind it and grow as you approach.
const CHASE_OFFSET = new Vector3(0, 0.7, 2.8);
const LOOK_AHEAD = new Vector3(0, 0.25, -6);
/** Exponential approach rate (1/s) for correcting toward the ideal framing.
 *  Distance is held by velocity compensation, so this only absorbs orbit/offset
 *  drift — the ship no longer outruns the camera at high thrust. */
const FOLLOW_RATE = 6;
/** Speed-zoom narrows the FOV by this many degrees at full speed (relative to
 *  the player's base FOV setting; was fixed 75 -> 68). */
const SPEED_ZOOM_DEG = 7;
const MAX_SPEED_FOR_FOV = 500;
/** Subtle extra chase distance at full throttle — a hint of pull-back, no more. */
const THROTTLE_ZOOM = 0.12;
/** Peak camera jitter (world units) at 100% throttle. */
const SHAKE_AMP = 0.14;
/** Collision sphere radius for the chase-cam sphere-cast (world units). */
const CAM_RADIUS = 0.4;
/** Gap kept between the camera sphere and a body surface after a collision. */
const CAM_MARGIN = 0.3;

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
const _camDir = new Vector3();
const _bodyPos = new Vector3();

/**
 * Sphere-cast from the ship toward the desired camera position against the
 * planets. A swept sphere (radius CAM_RADIUS) gives a forgiving, thick test —
 * unlike a thin raycast it won't let the camera slip a corner into terrain.
 * Returns the largest safe distance along `dir` (≤ maxDist).
 */
function sphereCastDistance(
  origin: Vector3,
  dir: Vector3, // unit
  maxDist: number,
  simTime: number,
): number {
  let best = maxDist;
  for (const p of PLANETS) {
    positionAtTime(p.elements, p.distance, simTime, _bodyPos);
    const r = p.size + CAM_RADIUS;
    // Ray-sphere: |origin + t*dir - center| = r, smallest positive t.
    const ox = origin.x - _bodyPos.x;
    const oy = origin.y - _bodyPos.y;
    const oz = origin.z - _bodyPos.z;
    const b = ox * dir.x + oy * dir.y + oz * dir.z;
    const c = ox * ox + oy * oy + oz * oz - r * r;
    if (c < 0) {
      // Origin already inside the inflated sphere — pin the camera to the ship.
      return 0;
    }
    const disc = b * b - c;
    if (disc <= 0) continue; // misses this body
    const t = -b - Math.sqrt(disc);
    if (t >= 0 && t < best) best = Math.max(0, t - CAM_MARGIN);
  }
  return best;
}

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

    // Right mouse button held = free-look (orbit camera); otherwise the mouse
    // flies the ship via the virtual joystick.
    let rightDown = false;

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
      if (document.pointerLockElement !== canvas) return;
      if (rightDown) addCameraLook(e.movementX, e.movementY);
      else addStickInput(e.movementX, e.movementY);
    };
    const onDown = (e: MouseEvent) => {
      if (e.button === 2) rightDown = true;
    };
    const onUp = (e: MouseEvent) => {
      if (e.button === 2) {
        rightDown = false;
        endCameraLook();
      }
    };
    const onContext = (e: Event) => e.preventDefault();
    const onLockChange = () => {
      if (document.pointerLockElement !== canvas) {
        rightDown = false;
        endCameraLook();
      }
    };

    canvas.addEventListener('click', onClick);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('mouseup', onUp);
    canvas.addEventListener('contextmenu', onContext);
    document.addEventListener('pointerlockchange', onLockChange);
    return () => {
      canvas.removeEventListener('click', onClick);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('contextmenu', onContext);
      document.removeEventListener('pointerlockchange', onLockChange);
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
      resetCameraLook();
    };
  }, [gl]);

  useFrame((state, delta) => {
    const store = useStore.getState();
    if (store.sceneMode.type !== 'piloting') return;

    // Live per-frame telemetry (the reactive store only mirrors it at a low
    // rate for the HUD) — the camera must track the ship exactly, same frame.
    const throttle = shipTelemetry.throttle; // raw lever position 0..1
    _shipPos.copy(shipTelemetry.position);
    _quat.copy(shipTelemetry.rotation);

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
      // MathUtils.damp is frame-rate independent (smoothing = 1 - e^(-rate*dt)).
      camBase.current.add(_shipDelta.copy(_shipPos).sub(prevShip.current));
      camBase.current.x = MathUtils.damp(camBase.current.x, _desired.x, FOLLOW_RATE, delta);
      camBase.current.y = MathUtils.damp(camBase.current.y, _desired.y, FOLLOW_RATE, delta);
      camBase.current.z = MathUtils.damp(camBase.current.z, _desired.z, FOLLOW_RATE, delta);
      prevShip.current.copy(_shipPos);
    }

    // Sphere-cast from the ship to the camera and pull in on any planet hit so
    // the view never punches through terrain when flying close to a surface.
    _camDir.copy(camBase.current).sub(_shipPos);
    const camDist = _camDir.length();
    if (camDist > 1e-4) {
      _camDir.multiplyScalar(1 / camDist);
      const safe = sphereCastDistance(_shipPos, _camDir, camDist, store.simTimeDays);
      if (safe < camDist) {
        camBase.current.copy(_shipPos).addScaledVector(_camDir, safe);
      }
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

    const speed = shipTelemetry.velocity.length();
    const fovT = Math.min(speed / MAX_SPEED_FOR_FOV, 1);
    camera.fov = store.fov - SPEED_ZOOM_DEG * fovT;
    camera.updateProjectionMatrix();
  });

  return null;
}

import { Quaternion, Vector3 } from 'three';

export const MAX_THRUST = 350;
/** Per-frame velocity retention (@60fps) when flight assist is ON — bleeds off
 *  momentum so the ship auto-decelerates to a stop when input is released. */
export const ASSIST_DAMPING = 0.985;
/** Near-frictionless Newtonian drift when flight assist is OFF. */
export const DRIFT_DAMPING = 0.9995;

/** Max angular rate per axis (rad/s), scaled by sensitivity. Capped so the
 *  ship never feels twitchy regardless of how hard the stick is pushed. */
export const MAX_PITCH_RATE = 1.4;
export const MAX_YAW_RATE = 1.2;
export const MAX_ROLL_RATE = 2.0;
/** How quickly angular velocity eases toward the commanded rate (1/s). Lower =
 *  weightier/more cinematic, higher = snappier. */
export const ROTATION_RESPONSE = 6;

export interface ShipInput {
  thrust: number;
  yaw: number;
  pitch: number;
  roll: number;
  /** Raw throttle lever position (0..1 magnitude), before the response curve —
   *  drives the UI zones and the last-quarter flight effects. */
  throttleRaw?: number;
}

/** Persisted per-axis angular velocity (rad/s) so rotation has inertia. */
export interface AngularVelocity {
  pitch: number;
  yaw: number;
  roll: number;
}

const _forward = new Vector3();
const _axis = new Vector3();
const _deltaQ = new Quaternion();

/**
 * Eases the ship's angular velocity toward the rate commanded by the (already
 * shaped) input and applies it about the ship's *local* axes. With no input the
 * target rate is zero, so the ship smoothly stabilizes — flight-assist style —
 * giving weighty, non-instant rotation rather than a twitchy 1:1 response.
 */
export function updateRotation(
  quat: Quaternion,
  angVel: AngularVelocity,
  input: ShipInput,
  sensitivity: number,
  dt: number,
): void {
  const targetPitch = -input.pitch * MAX_PITCH_RATE * sensitivity;
  const targetYaw = -input.yaw * MAX_YAW_RATE * sensitivity;
  const targetRoll = -input.roll * MAX_ROLL_RATE * sensitivity;

  // Frame-rate independent exponential approach.
  const k = 1 - Math.exp(-ROTATION_RESPONSE * dt);
  angVel.pitch += (targetPitch - angVel.pitch) * k;
  angVel.yaw += (targetYaw - angVel.yaw) * k;
  angVel.roll += (targetRoll - angVel.roll) * k;

  if (Math.abs(angVel.pitch) > 1e-5) {
    _axis.set(1, 0, 0);
    _deltaQ.setFromAxisAngle(_axis, angVel.pitch * dt);
    quat.multiply(_deltaQ);
  }
  if (Math.abs(angVel.yaw) > 1e-5) {
    _axis.set(0, 1, 0);
    _deltaQ.setFromAxisAngle(_axis, angVel.yaw * dt);
    quat.multiply(_deltaQ);
  }
  if (Math.abs(angVel.roll) > 1e-5) {
    _axis.set(0, 0, 1);
    _deltaQ.setFromAxisAngle(_axis, angVel.roll * dt);
    quat.multiply(_deltaQ);
  }
  quat.normalize();
}

export function computeThrust(quat: Quaternion, throttle: number): Vector3 {
  _forward.set(0, 0, -1).applyQuaternion(quat);
  return _forward.multiplyScalar(throttle * MAX_THRUST);
}

export function integrate(
  position: Vector3,
  velocity: Vector3,
  acceleration: Vector3,
  damping: number,
  dt: number,
): void {
  velocity.addScaledVector(acceleration, dt);
  const dampFactor = Math.pow(damping, dt * 60);
  velocity.multiplyScalar(dampFactor);
  position.addScaledVector(velocity, dt);
}

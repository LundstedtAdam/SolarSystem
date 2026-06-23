import { Quaternion, Vector3 } from 'three';

export const MAX_THRUST = 120;
export const DAMPING = 0.985;
export const GRAVITY_RANGE = 80;
export const GRAVITY_STRENGTH = 500;
export const ROTATION_SPEED = 1.8;

const _forward = new Vector3();
const _axis = new Vector3();
const _deltaQ = new Quaternion();
const _grav = new Vector3();

export interface ShipInput {
  thrust: number;
  yaw: number;
  pitch: number;
  roll: number;
}

export interface GravityBody {
  position: Vector3;
  size: number;
}

export function applyRotation(
  quat: Quaternion,
  input: ShipInput,
  dt: number,
): Quaternion {
  const rate = ROTATION_SPEED * dt;
  if (Math.abs(input.yaw) > 0.01) {
    _axis.set(0, 1, 0);
    _deltaQ.setFromAxisAngle(_axis, -input.yaw * rate);
    quat.premultiply(_deltaQ);
  }
  if (Math.abs(input.pitch) > 0.01) {
    _axis.set(1, 0, 0);
    _deltaQ.setFromAxisAngle(_axis, -input.pitch * rate);
    quat.premultiply(_deltaQ);
  }
  if (Math.abs(input.roll) > 0.01) {
    _axis.set(0, 0, 1);
    _deltaQ.setFromAxisAngle(_axis, -input.roll * rate);
    quat.premultiply(_deltaQ);
  }
  quat.normalize();
  return quat;
}

export function computeThrust(quat: Quaternion, throttle: number): Vector3 {
  _forward.set(0, 0, -1).applyQuaternion(quat);
  return _forward.multiplyScalar(throttle * MAX_THRUST);
}

export function computeGravity(
  shipPos: Vector3,
  bodies: GravityBody[],
): Vector3 {
  _grav.set(0, 0, 0);
  for (const body of bodies) {
    const dx = body.position.x - shipPos.x;
    const dy = body.position.y - shipPos.y;
    const dz = body.position.z - shipPos.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    const dist = Math.sqrt(distSq);
    if (dist > GRAVITY_RANGE || dist < 1) continue;
    const mass = body.size * body.size * body.size;
    const strength = Math.min(GRAVITY_STRENGTH * mass / distSq, 50);
    _grav.x += (dx / dist) * strength;
    _grav.y += (dy / dist) * strength;
    _grav.z += (dz / dist) * strength;
  }
  return _grav;
}

export function integrate(
  position: Vector3,
  velocity: Vector3,
  acceleration: Vector3,
  dt: number,
): void {
  velocity.addScaledVector(acceleration, dt);
  const dampFactor = Math.pow(DAMPING, dt * 60);
  velocity.multiplyScalar(dampFactor);
  position.addScaledVector(velocity, dt);
}

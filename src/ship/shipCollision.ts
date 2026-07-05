import { Vector3 } from 'three';
import { PLANETS, moonLocalOffset } from '../systems/bodies';
import { positionAtTime } from '../systems/ephemeris';

/** Fraction of tangential velocity retained on contact — slides the ship along
 *  a surface rather than a dead stop (too abrupt) or a bounce (too jarring at
 *  flight speeds). Chosen once and reused for every collidable category. */
export const TANGENTIAL_RETAIN = 0.6;
/** Gap kept between the ship's collision sphere and a surface after a
 *  correction, so the next frame doesn't immediately re-trigger. */
const SKIN = 0.05;

const _bodyPos = new Vector3();
const _normal = new Vector3();
const _normalVel = new Vector3();

/**
 * Analytic sphere-vs-sphere push-out + velocity projection, shared by every
 * caller that needs to resolve a body-vs-planet contact (ship, debris). Loops
 * `PLANETS` (+ moons) — small N, no partitioning needed, same style as
 * `ShipCamera.tsx`'s `sphereCastDistance`.
 *
 * Mutates `position`/`velocity` in place. Returns true if a correction was
 * applied this call.
 */
export function sphereVsPlanets(
  position: Vector3,
  velocity: Vector3,
  simTimeDays: number,
  radius: number,
  tangentialRetain: number,
): boolean {
  let hit = false;
  for (const p of PLANETS) {
    positionAtTime(p.elements, p.distance, simTimeDays, _bodyPos);
    if (resolveSphere(position, velocity, _bodyPos, p.size, radius, tangentialRetain)) hit = true;

    for (const m of p.moons) {
      const [ox, oy, oz] = moonLocalOffset(m, simTimeDays);
      _bodyPos.x += ox;
      _bodyPos.y += oy;
      _bodyPos.z += oz;
      if (resolveSphere(position, velocity, _bodyPos, m.size, radius, tangentialRetain)) hit = true;
    }
  }
  return hit;
}

/** Single sphere-vs-sphere contact test + resolution against one body. */
function resolveSphere(
  position: Vector3,
  velocity: Vector3,
  center: Vector3,
  bodyRadius: number,
  radius: number,
  tangentialRetain: number,
): boolean {
  const minDist = bodyRadius + radius;
  _normal.copy(position).sub(center);
  const distSq = _normal.lengthSq();
  if (distSq >= minDist * minDist) return false;

  const dist = Math.sqrt(distSq);
  if (dist > 1e-6) _normal.multiplyScalar(1 / dist);
  else _normal.set(0, 1, 0); // degenerate (exact center overlap) — push up arbitrarily

  // Push the position out to the surface + skin.
  position.copy(center).addScaledVector(_normal, minDist + SKIN);

  // Zero the into-surface velocity component, damp-retain the tangential one.
  const normalSpeed = velocity.dot(_normal);
  if (normalSpeed < 0) {
    _normalVel.copy(_normal).multiplyScalar(normalSpeed);
    velocity.sub(_normalVel); // strip normal component
    velocity.multiplyScalar(tangentialRetain);
  }
  return true;
}

/** Ship-vs-planet/moon collision — slide response, never a force/acceleration
 *  term (must not be mistaken for a reintroduced gravity well; see the
 *  "Phase 11: pure thrust, no gravity" comment in shipPhysics.ts). */
export function resolvePlanetCollision(
  position: Vector3,
  velocity: Vector3,
  simTimeDays: number,
  shipRadius: number,
): boolean {
  return sphereVsPlanets(position, velocity, simTimeDays, shipRadius, TANGENTIAL_RETAIN);
}

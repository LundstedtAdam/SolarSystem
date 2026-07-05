import { Vector3 } from 'three';
import { PLANETS, moonLocalOffset } from '../systems/bodies';
import { positionAtTime } from '../systems/ephemeris';
import { queryNearby } from '../systems/asteroidGrid';
import { TIERS } from '../systems/asteroidLayout';
import { asteroidRuntime } from '../scene/asteroidRuntime';

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
    if (resolveSphereContact(position, velocity, _bodyPos, p.size, radius, tangentialRetain) !== null)
      hit = true;

    for (const m of p.moons) {
      const [ox, oy, oz] = moonLocalOffset(m, simTimeDays);
      _bodyPos.x += ox;
      _bodyPos.y += oy;
      _bodyPos.z += oz;
      if (resolveSphereContact(position, velocity, _bodyPos, m.size, radius, tangentialRetain) !== null)
        hit = true;
    }
  }
  return hit;
}

/** Single sphere-vs-sphere contact test + resolution against one body.
 *  Returns the pre-correction normal (into-surface) speed when a contact was
 *  resolved, or null on a miss — callers that need "how hard did it hit"
 *  (collision-triggered asteroid damage) read that value before it's zeroed. */
export function resolveSphereContact(
  position: Vector3,
  velocity: Vector3,
  center: Vector3,
  bodyRadius: number,
  radius: number,
  tangentialRetain: number,
): number | null {
  const minDist = bodyRadius + radius;
  _normal.copy(position).sub(center);
  const distSq = _normal.lengthSq();
  if (distSq >= minDist * minDist) return null;

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
  return normalSpeed < 0 ? -normalSpeed : 0;
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

export interface AsteroidHitInfo {
  globalIdx: number;
  /** World-space contact point. */
  contactPoint: Vector3;
  /** Speed (world units/s) the ship was closing on the asteroid before the
   *  correction — the "how hard did it hit" §4/§6 collision-damage callers
   *  need. */
  closingSpeed: number;
}

/** Largest possible asteroid bounding radius across every tier, used to size
 *  the broadphase query so nothing large enough to matter is missed. */
const MAX_ASTEROID_RADIUS = Math.max(...TIERS.map((t) => t.max));

const _localPos = new Vector3();
const _localVel = new Vector3();
const _worldContact = new Vector3();

/** Rotate `(x, z)` about the world Y axis by `angle` (the belt's only degree
 *  of orbital-drift freedom), writing into `out`. */
function rotateY(v: Vector3, angle: number, out: Vector3): void {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  out.set(v.x * cos + v.z * sin, v.y, -v.x * sin + v.z * cos);
}

/**
 * Ship-vs-asteroid collision — same slide response as planets, but broadphase
 * via the belt's spatial grid instead of scanning every instance. The grid is
 * indexed in belt-local space (the whole belt rotates as one group each
 * frame), so the query point/velocity are rotated into that frame and the
 * result rotated back before returning.
 *
 * Returns info about the hardest-hit asteroid this call (for collision-
 * triggered damage in the fracture/mining systems), or null if nothing was
 * touched.
 */
export function resolveAsteroidCollision(
  position: Vector3,
  velocity: Vector3,
  shipRadius: number,
): AsteroidHitInfo | null {
  const grid = asteroidRuntime.grid;
  if (!grid) return null;

  const yaw = asteroidRuntime.groupYaw;
  rotateY(position, -yaw, _localPos);
  rotateY(velocity, -yaw, _localVel);

  const queryRadius = shipRadius + MAX_ASTEROID_RADIUS;
  const candidates = queryNearby(grid, _localPos.x, _localPos.z, queryRadius);

  let best: { globalIdx: number; contactLocal: Vector3; closingSpeed: number } | null = null;

  for (const idx of candidates) {
    const s = asteroidRuntime.states[idx];
    if (!s || !s.alive) continue;
    const speed = resolveSphereContact(_localPos, _localVel, s.pos, s.radius, shipRadius, TANGENTIAL_RETAIN);
    if (speed === null) continue;
    if (!best || speed > best.closingSpeed) {
      best = { globalIdx: idx, contactLocal: s.pos.clone(), closingSpeed: speed };
    }
  }

  // Write the (possibly corrected) local position/velocity back to world space.
  rotateY(_localPos, yaw, position);
  rotateY(_localVel, yaw, velocity);

  if (!best) return null;
  rotateY(best.contactLocal, yaw, _worldContact);
  return { globalIdx: best.globalIdx, contactPoint: _worldContact.clone(), closingSpeed: best.closingSpeed };
}

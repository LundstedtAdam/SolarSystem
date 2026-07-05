// Debris integration + collision. Debris is a free-flying fragment once
// spawned — it drifts in inertial (world) space independent of the belt's
// orbital rotation, integrated via the exact same `integrate()` helper the
// ship uses (reused, not duplicated), with a debris-specific damping and no
// thrust/rotation input.
//
// On any contact (planet, asteroid, other debris) a fragment sticks and
// expires rather than continuing to bounce — bounded and simple, per the
// brief's "avoid overcomplicating physics" — so this module never needs a
// second broadphase for the general case: debris population is capped small
// (QUALITY[...].debrisMax, at most a couple hundred), so an O(n^2)
// debris-vs-debris pass is cheap, while debris-vs-asteroid reuses the belt's
// existing spatial grid (population there can be thousands).

import { Quaternion, Vector3 } from 'three';
import { integrate, DEBRIS_DAMPING } from '../ship/shipPhysics';
import { sphereVsPlanets, rotateY } from '../ship/shipCollision';
import { asteroidRuntime } from '../scene/asteroidRuntime';
import { queryNearby } from './asteroidGrid';
import { TIERS } from './asteroidLayout';
import type { DebrisBody } from '../scene/debrisRuntime';

const MAX_ASTEROID_RADIUS = Math.max(...TIERS.map((t) => t.max));

const _localPos = new Vector3();
const ZERO_ACCEL = new Vector3(0, 0, 0);
const _spinAxis = new Vector3();
const _spinDeltaQ = new Quaternion();

/** True if `debris` overlaps a live asteroid in the belt's spatial grid
 *  (converts world position into the belt-local frame the grid is indexed
 *  in, same convention as `resolveAsteroidCollision`). */
function hitsAsteroid(debris: DebrisBody): boolean {
  const grid = asteroidRuntime.grid;
  if (!grid) return false;
  rotateY(debris.pos, -asteroidRuntime.groupYaw, _localPos);
  const candidates = queryNearby(grid, _localPos.x, _localPos.z, debris.radius + MAX_ASTEROID_RADIUS);
  for (const idx of candidates) {
    const s = asteroidRuntime.states[idx];
    if (!s || !s.alive) continue;
    const minDist = s.radius + debris.radius;
    if (_localPos.distanceToSquared(s.pos) < minDist * minDist) return true;
  }
  return false;
}

/**
 * Integrate + resolve every debris body one frame. Expired (impacted,
 * timed-out, or culled-by-distance) fragments are swap-removed from `list`
 * in place. `shipPos` drives the distance-cull; `simTimeDays` is needed for
 * the planet sphere test (bodies move in the sim clock).
 */
export function updateDebrisBodies(
  list: DebrisBody[],
  dt: number,
  simTimeDays: number,
  shipPos: Vector3,
  maxLifeSec: number,
  cullDistance: number,
): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const d = list[i];
    d.life += dt;

    let expired = d.life >= maxLifeSec || d.pos.distanceTo(shipPos) > cullDistance;

    if (!expired) {
      integrate(d.pos, d.vel, ZERO_ACCEL, DEBRIS_DAMPING, dt);
      if (d.angVel.lengthSq() > 1e-8) {
        _spinAxis.copy(d.angVel).normalize();
        _spinDeltaQ.setFromAxisAngle(_spinAxis, d.angVel.length() * dt);
        d.quat.multiply(_spinDeltaQ);
      }
      // Any contact sticks-and-expires — no continued bouncing.
      if (sphereVsPlanets(d.pos, d.vel, simTimeDays, d.radius, 0)) expired = true;
      else if (hitsAsteroid(d)) expired = true;
      else {
        for (let j = 0; j < list.length; j++) {
          if (j === i) continue;
          const other = list[j];
          const minDist = d.radius + other.radius;
          if (d.pos.distanceToSquared(other.pos) < minDist * minDist) {
            expired = true;
            break;
          }
        }
      }
    }

    if (expired) {
      list[i] = list[list.length - 1];
      list.pop();
    }
  }
}

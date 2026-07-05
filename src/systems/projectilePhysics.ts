// Weapon-projectile integration + collision. A shot is a real traveling
// body, not an instant hitscan resolution — each frame it moves forward at
// its own finite velocity, and the *segment* it just swept through this frame
// (not just its new point position) is tested against asteroids/planets, so
// a fast bolt can't tunnel through a small target between frames. On a hit it
// feeds the exact same `applyAsteroidDamage` pipeline collision damage uses
// (real momentum: the projectile's own velocity, not a synthesized bias), then
// expires — projectiles don't bounce or cascade like debris does.

import { Vector3 } from 'three';
import { integrate } from '../ship/shipPhysics';
import { raycastAsteroids, PROJECTILE_MAX_LIFE_SEC, SHOT_DAMAGE } from '../ship/spaceMining';
import { raycastPlanets } from '../ship/shipCollision';
import { applyAsteroidDamage } from './asteroidFracture';
import { miningSparkRuntime } from '../scene/miningSparkRuntime';
import { audio } from '../audio/AudioManager';
import type { ProjectileBody } from '../scene/projectileRuntime';

/** Impact-chip spark count spawned at the exact point of contact. */
const SPARKS_PER_HIT = 4;
/** Beyond this multiple of a shot's own max travel distance from the ship,
 *  force-cull regardless of lifetime (handles the ship flying away from a
 *  shot that's still nominally "alive"). */
const CULL_RANGE_FACTOR = 3;

const ZERO_ACCEL = new Vector3(0, 0, 0);
const _prevPos = new Vector3();
const _delta = new Vector3();

/**
 * Integrate + resolve every in-flight projectile one frame. A connecting hit
 * (asteroid or planet/moon) expires the shot immediately; otherwise it keeps
 * flying until its lifetime or range is exceeded. `list` is mutated in place
 * (swap-remove on expiry, matching the rest of this codebase's pooled-runtime
 * convention).
 */
export function updateProjectiles(
  list: ProjectileBody[],
  dt: number,
  simTimeDays: number,
  shipPos: Vector3,
  maxRange: number,
): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.life += dt;

    let expired = p.life >= PROJECTILE_MAX_LIFE_SEC || p.pos.distanceTo(shipPos) > maxRange * CULL_RANGE_FACTOR;

    if (!expired) {
      _prevPos.copy(p.pos);
      integrate(p.pos, p.vel, ZERO_ACCEL, 1, dt); // straight-line flight, no drag/decay
      _delta.copy(p.pos).sub(_prevPos);
      const segLen = _delta.length();

      if (segLen > 1e-6) {
        _delta.multiplyScalar(1 / segLen);
        const asteroidHit = raycastAsteroids(_prevPos, _delta, segLen);
        if (asteroidHit) {
          applyAsteroidDamage(asteroidHit.globalIdx, SHOT_DAMAGE, asteroidHit.point, p.vel);
          miningSparkRuntime.spawn(asteroidHit.point, SPARKS_PER_HIT);
          audio.playMiningShot(true);
          expired = true;
        } else {
          const planetHit = raycastPlanets(_prevPos, _delta, segLen, simTimeDays);
          if (planetHit) {
            miningSparkRuntime.spawn(planetHit.point, SPARKS_PER_HIT);
            expired = true;
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

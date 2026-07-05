// Asteroid damage/fracture model. An asteroid is a composite body with
// localized structural health, not a binary object — low-damage hits just
// wear it down (no debris), a hit that finishes it off spawns a handful of
// independent debris fragments, and a hit that finishes it off with a lot of
// spare force spawns more, larger fragments. Debris never recursively
// fractures (hard budget stop) — this is the one damage pipeline both
// collision (shipCollision.ts) and deliberate mining/weapon fire
// (spaceMining.ts) route through.

import { Vector3 } from 'three';
import { cellHash } from '../voxel/noise';
import { asteroidRuntime } from '../scene/asteroidRuntime';
import { debrisRuntime, type DebrisSpawnSpec } from '../scene/debrisRuntime';
import type { ResourceType } from '../voxel/voxelTypes';

export type FractureTier = 'none' | 'low' | 'medium' | 'high';

export interface FractureResult {
  tier: FractureTier;
  debrisSpawned: DebrisSpawnSpec[];
}

/** Overkill (damage beyond zero health) as a fraction of maxHealth, above
 *  which a fracture is "high" tier instead of "medium". */
const HIGH_OVERKILL_FRAC = 0.6;
const MEDIUM_DEBRIS_RANGE: [number, number] = [1, 5];
const HIGH_DEBRIS_RANGE: [number, number] = [4, 8];

/** Fraction of a fracture's fragments that come back as collectible ore
 *  rather than plain inert rock — applies uniformly regardless of whether the
 *  fracture was mining- or collision-triggered (one damage pipeline, same
 *  reward either way). */
const ORE_FRACTION = 0.4;
const ORE_TYPES: ResourceType[] = ['iron', 'silicon', 'titanite', 'hematite', 'lithium'];

/** Knockback impulse per unit of damage (world units/s per damage point) —
 *  every hit nudges the asteroid in the shot's direction of travel, not just
 *  fracturing ones. Tuned so a solid hit visibly shifts a rock without
 *  flinging it; actual on-screen drift is also damped in AsteroidBelt.tsx. */
const KNOCKBACK_PER_DAMAGE = 0.35;

const _dir = new Vector3();
const _jitter = new Vector3();

/**
 * Apply `amount` damage to asteroid `globalIdx` from a hit at `impactPoint`
 * with `impactVelocity` (world-space; used to bias fragment ejection
 * direction and scale their outward speed). Mutates the asteroid's health in
 * place; on a lethal hit, kills the asteroid (via `asteroidRuntime`) and
 * spawns debris (via `debrisRuntime`) as a side effect, in addition to
 * returning the result for inspection/tests.
 */
export function applyAsteroidDamage(
  globalIdx: number,
  amount: number,
  impactPoint: Vector3,
  impactVelocity: Vector3,
): FractureResult {
  const state = asteroidRuntime.states[globalIdx];
  if (!state || !state.alive || state.indestructible) {
    return { tier: 'none', debrisSpawned: [] };
  }

  _dir.copy(impactVelocity);
  const speed = _dir.length();
  if (speed < 1e-6) _dir.set(0, 0, -1);
  else _dir.normalize();

  // Knockback: every hit nudges the asteroid in the shot's direction of
  // travel, whether or not it fractures — a physical reaction to being hit,
  // not just a destruction effect. Integrated/damped in AsteroidBelt.tsx.
  state.vel.addScaledVector(_dir, amount * KNOCKBACK_PER_DAMAGE);

  // Promote on the first damaging hit (tier/budget permitting — see
  // AsteroidBelt.tsx's promotion API) so local damage has a standalone,
  // individually deformable mesh to actually dent instead of just decrementing
  // health invisibly. This is the single source of truth for `state.promoted`
  // — the promotion API itself just reports success/failure.
  if (!state.promoted && asteroidRuntime.promotion?.promote(globalIdx)) {
    state.promoted = true;
  }

  state.health -= amount;
  if (state.health > 0) {
    // Low impact: real local damage — a persistent crater at the impact
    // point — instead of the asteroid just silently losing health. No-op if
    // this rock wasn't promoted (dust tier, or the promotion budget was full).
    if (state.promoted) asteroidRuntime.promotion?.applyDent(globalIdx, impactPoint, amount);
    return { tier: 'none', debrisSpawned: [] };
  }

  const overkillFrac = -state.health / state.maxHealth;
  const tier: FractureTier = overkillFrac >= HIGH_OVERKILL_FRAC ? 'high' : 'medium';
  const [minN, maxN] = tier === 'high' ? HIGH_DEBRIS_RANGE : MEDIUM_DEBRIS_RANGE;

  // Deterministic fragment count/directions from a hash of this specific
  // hit — a per-asteroid hit counter (not Math.random()) so repeated hits on
  // the same rock don't collide on identical hash inputs while staying
  // reproducible within the session.
  state.hitSeq += 1;
  const countHash = cellHash(globalIdx, state.hitSeq, state.seed + 6000);
  const count = minN + Math.floor(countHash * (maxN - minN + 1));

  const debrisSpawned: DebrisSpawnSpec[] = [];
  for (let k = 0; k < count; k++) {
    const stream = state.hitSeq * 100 + k;
    const theta = cellHash(globalIdx, stream, state.seed + 6001) * Math.PI * 2;
    const phi = Math.acos(cellHash(globalIdx, stream, state.seed + 6002) * 2 - 1);
    _jitter.set(Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi));

    // Outward "explosion" component scaled by damage, biased toward the
    // impact direction — narratively plausible, not rigorously simulated.
    const outwardSpeed = 2 + speed * 0.4;
    const vel = _jitter
      .clone()
      .multiplyScalar(outwardSpeed)
      .addScaledVector(_dir, speed * 0.3);

    // Mass split proportional to radius^3 of the parent (roughly conserved,
    // not exact) — approximated here directly as a radius fraction.
    const fragFrac = 0.25 + cellHash(globalIdx, stream, state.seed + 6003) * 0.35;
    const fragRadius = state.radius * fragFrac;
    const pos = impactPoint.clone().addScaledVector(_jitter, fragRadius * 0.5);

    const oreHash = cellHash(globalIdx, stream, state.seed + 6004);
    const isOre = oreHash < ORE_FRACTION;
    const resourceType = isOre
      ? ORE_TYPES[Math.floor(cellHash(globalIdx, stream, state.seed + 6005) * ORE_TYPES.length)]
      : undefined;

    debrisSpawned.push({ pos, vel, radius: fragRadius, isOre, resourceType });
  }

  for (const spec of debrisSpawned) debrisRuntime.spawn(spec);
  asteroidRuntime.killAsteroid?.(globalIdx);

  return { tier, debrisSpawned };
}

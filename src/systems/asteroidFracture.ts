// Asteroid damage/fracture model. An asteroid is a composite body with
// localized structural health, not a binary object — low-damage hits just
// wear it down (leaving a persistent local dent, see asteroidDent.ts), a hit
// that finishes it off extracts real chunks of its own geometry (see
// asteroidFracturePatterns.ts) as independent debris fragments whose initial
// velocity/spin follow real rigid-body momentum (parent linear + angular
// velocity at the fragment's offset, plus the impact's own direction/force),
// and a hit that finishes it off with a lot of spare force extracts more,
// larger fragments. Debris never recursively fractures beyond one cascade
// level (see debrisPhysics.ts) — this is the one damage pipeline both
// collision (shipCollision.ts) and deliberate mining/weapon fire
// (spaceMining.ts) route through.

import { Quaternion, Vector3 } from 'three';
import { cellHash } from '../voxel/noise';
import { asteroidRuntime } from '../scene/asteroidRuntime';
import { debrisRuntime, type DebrisSpawnSpec } from '../scene/debrisRuntime';
import { rotateY } from '../ship/shipCollision';
import {
  getFracturePatterns,
  pickPatternIndex,
  pickClusterIndices,
  computeClusterCentroid,
} from './asteroidFracturePatterns';
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
/** Fragment spin rate cap (rad/s) — faster/smaller ejecta spin faster, but
 *  never so fast it reads as jittery noise. */
const MAX_SPIN_RATE = 6;

const _dir = new Vector3();
const _dirLocal = new Vector3();
const _centroid = new Vector3();
const _parentOffset = new Vector3();
const _angVelCross = new Vector3();
const _fragVel = new Vector3();
const _fragQuat = new Quaternion();
const _yawQuat = new Quaternion();
const _yAxis = new Vector3(0, 1, 0);
const _localPos = new Vector3();
const _worldPos = new Vector3();
const _worldVel = new Vector3();

interface SharedFragmentProps {
  jitter: Vector3;
  outwardSpeed: number;
  fragRadius: number;
  isOre: boolean;
  resourceType: ResourceType | undefined;
  angVel: Vector3;
}

/** Per-fragment properties common to both the pattern-based and fallback
 *  spawn paths — deterministically hashed off this specific hit (never
 *  `Math.random()`), so repeated hits on the same rock don't collide on
 *  identical inputs while staying reproducible within the session. */
function computeSharedFragmentProps(
  globalIdx: number,
  stream: number,
  seed: number,
  speed: number,
  parentRadius: number,
): SharedFragmentProps {
  const theta = cellHash(globalIdx, stream, seed + 6001) * Math.PI * 2;
  const phi = Math.acos(cellHash(globalIdx, stream, seed + 6002) * 2 - 1);
  const jitter = new Vector3(Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi));
  const outwardSpeed = 2 + speed * 0.4;

  // Mass split proportional to radius^3 of the parent (roughly conserved,
  // not exact) — approximated here directly as a radius fraction.
  const fragFrac = 0.25 + cellHash(globalIdx, stream, seed + 6003) * 0.35;
  const fragRadius = parentRadius * fragFrac;

  const oreHash = cellHash(globalIdx, stream, seed + 6004);
  const isOre = oreHash < ORE_FRACTION;
  const resourceType = isOre
    ? ORE_TYPES[Math.floor(cellHash(globalIdx, stream, seed + 6005) * ORE_TYPES.length)]
    : undefined;

  // Spin: faster, smaller ejecta tumble faster — physically motivated, cheap.
  const spinTheta = cellHash(globalIdx, stream, seed + 6006) * Math.PI * 2;
  const spinPhi = Math.acos(cellHash(globalIdx, stream, seed + 6007) * 2 - 1);
  const spinAxis = new Vector3(
    Math.sin(spinPhi) * Math.cos(spinTheta),
    Math.sin(spinPhi) * Math.sin(spinTheta),
    Math.cos(spinPhi),
  );
  const spinRate = Math.min(
    (0.3 + cellHash(globalIdx, stream, seed + 6008) * 1.2) * (outwardSpeed / Math.max(fragRadius, 0.1)),
    MAX_SPIN_RATE,
  );
  const angVel = spinAxis.multiplyScalar(spinRate);

  return { jitter, outwardSpeed, fragRadius, isOre, resourceType, angVel };
}

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

  // The impact direction arrives in world space, but `state.pos`/`state.vel`
  // live in belt-local space (the whole belt group is rotated by `groupYaw`
  // each frame, and the tumble loop integrates pos/vel in that local frame) —
  // rotate the direction into the belt frame before using it for anything
  // that feeds local state, and rotate spawned debris back out to world
  // (debris simulates in world space, so a local-frame spawn position would
  // be off by the full belt rotation — thousands of units at belt radius).
  const yaw = asteroidRuntime.groupYaw;
  rotateY(_dir, -yaw, _dirLocal);

  // Knockback: every hit nudges the asteroid in the shot's direction of
  // travel, whether or not it fractures — a physical reaction to being hit,
  // not just a destruction effect. Integrated/damped in AsteroidBelt.tsx.
  state.vel.addScaledVector(_dirLocal, amount * KNOCKBACK_PER_DAMAGE);

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

  state.hitSeq += 1;
  const countHash = cellHash(globalIdx, state.hitSeq, state.seed + 6000);
  const count = minN + Math.floor(countHash * (maxN - minN + 1));

  const geometry = asteroidRuntime.promotion?.getSourceGeometry(globalIdx) ?? null;
  const momentum = asteroidRuntime.promotion?.getMomentumInputs(globalIdx) ?? null;

  const debrisSpawned: DebrisSpawnSpec[] = [];

  if (geometry && momentum) {
    // Pattern-based extraction: fragments come from real clusters of the
    // asteroid's own (possibly already-dented) geometry, positioned/launched
    // via real rigid-body momentum — parent linear velocity + parent angular
    // velocity at the fragment's offset-from-center, plus the existing
    // impact-driven ejection terms.
    const patterns = getFracturePatterns(state.tierIdx, state.variantIdx, geometry);
    const patternIdx = pickPatternIndex(patterns, globalIdx, state.hitSeq, state.seed);
    const pattern = patterns[patternIdx];
    const clusterIndices = pickClusterIndices(pattern, count, globalIdx, state.hitSeq, state.seed);

    // Fragment kinematics are computed in the belt-local frame (state.pos/
    // state.vel/momentum.quat/momentum.angVel all live there), then rotated
    // to world for the spawn — debris simulates in world space.
    _yawQuat.setFromAxisAngle(_yAxis, yaw);

    for (let k = 0; k < clusterIndices.length; k++) {
      const stream = state.hitSeq * 100 + k;
      const shared = computeSharedFragmentProps(globalIdx, stream, state.seed, speed, state.radius);

      computeClusterCentroid(geometry, pattern, clusterIndices[k], _centroid);
      _parentOffset.copy(_centroid).multiply(momentum.scale).applyQuaternion(momentum.quat);

      _fragVel
        .copy(state.vel)
        .add(_angVelCross.copy(momentum.angVel).cross(_parentOffset))
        .addScaledVector(shared.jitter, shared.outwardSpeed)
        .addScaledVector(_dirLocal, speed * 0.3);

      _localPos.copy(state.pos).add(_parentOffset);
      rotateY(_localPos, yaw, _worldPos);
      rotateY(_fragVel, yaw, _worldVel);
      // Fragment starts oriented like the parent it broke from — the
      // parent's local orientation composed with the belt's own rotation.
      _fragQuat.copy(_yawQuat).multiply(momentum.quat);

      debrisSpawned.push({
        pos: _worldPos.clone(),
        vel: _worldVel.clone(),
        radius: shared.fragRadius,
        isOre: shared.isOre,
        resourceType: shared.resourceType,
        angVel: shared.angVel,
        quat: _fragQuat.clone(),
        cascadeDepth: 0,
        shapeKey: { tierIdx: state.tierIdx, variantIdx: state.variantIdx, patternIdx, clusterIdx: clusterIndices[k] },
      });
    }
  } else {
    // Fallback (no promotion API registered — e.g. no belt mounted): the
    // simpler jitter-only spawn, no momentum/geometry inputs available.
    for (let k = 0; k < count; k++) {
      const stream = state.hitSeq * 100 + k;
      const shared = computeSharedFragmentProps(globalIdx, stream, state.seed, speed, state.radius);
      const vel = shared.jitter.clone().multiplyScalar(shared.outwardSpeed).addScaledVector(_dir, speed * 0.3);
      const pos = impactPoint.clone().addScaledVector(shared.jitter, shared.fragRadius * 0.5);

      debrisSpawned.push({
        pos,
        vel,
        radius: shared.fragRadius,
        isOre: shared.isOre,
        resourceType: shared.resourceType,
        angVel: shared.angVel,
        cascadeDepth: 0,
      });
    }
  }

  for (const spec of debrisSpawned) debrisRuntime.spawn(spec);
  asteroidRuntime.killAsteroid?.(globalIdx);

  return { tier, debrisSpawned };
}

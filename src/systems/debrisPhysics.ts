// Debris integration + collision. Debris is a free-flying fragment once
// spawned — it drifts in inertial (world) space independent of the belt's
// orbital rotation, integrated via the exact same `integrate()` helper the
// ship uses (reused, not duplicated), with a debris-specific damping and no
// thrust/rotation input.
//
// Contact (planet, asteroid, other debris) is a real bounce — reflection
// physics via `reflectSphereContact`/`reflectSphereVsPlanets`
// (`shipCollision.ts`), not "detect overlap → delete". A fragment persists
// and keeps drifting/bouncing until it times out or is culled by distance.
// A hard-enough hit (closing speed past `SECONDARY_FRACTURE_SPEED`) chips off
// a couple of small secondary fragments — capped to exactly one extra
// cascade level (`cascadeDepth`), so population growth is a bounded constant
// multiply, never recursive.
//
// Debris population is capped small (QUALITY[...].debrisMax, at most a
// couple hundred), so an O(n^2) debris-vs-debris pass is cheap, while
// debris-vs-asteroid reuses the belt's existing spatial grid (population
// there can be thousands).

import { Quaternion, Vector3 } from 'three';
import { integrate, DEBRIS_DAMPING } from '../ship/shipPhysics';
import {
  reflectSphereVsPlanets,
  reflectSphereContact,
  rotateY,
  DEBRIS_RESTITUTION,
  DEBRIS_TANGENTIAL_FRICTION,
} from '../ship/shipCollision';
import { asteroidRuntime } from '../scene/asteroidRuntime';
import { debrisRuntime, type DebrisBody } from '../scene/debrisRuntime';
import { queryNearby } from './asteroidGrid';
import { TIERS } from './asteroidLayout';

const MAX_ASTEROID_RADIUS = Math.max(...TIERS.map((t) => t.max));

/** Closing speed (world units/s) past which a bounce is hard enough to chip
 *  off secondary fragments. */
const SECONDARY_FRACTURE_SPEED = 4;
/** The parent fragment shrinks rather than being destroyed when it chips. */
const PARENT_SHRINK = 0.85;
const CHIP_COUNT_RANGE: [number, number] = [1, 2];
const CHIP_RADIUS_FRAC = 0.3;
const CHIP_SPIN_RATE = 4;

const _localPos = new Vector3();
const _localVel = new Vector3();
const ZERO_ACCEL = new Vector3(0, 0, 0);
const _spinAxis = new Vector3();
const _spinDeltaQ = new Quaternion();
const _pairNormal = new Vector3();
const _relVel = new Vector3();
const _chipDir = new Vector3();
const _chipAngVel = new Vector3();

/** Per-frame scratch: closing speed a pair collision imparted on the
 *  lower-indexed body of the pair, read back when that body gets its own
 *  turn later in the same downward pass (see `updateDebrisBodies`). */
const _pairClosing: number[] = [];

/** Real two-body impulse (mass ∝ radius^3), plus a proportional push-out so
 *  overlapping fragments don't visibly sink into each other. Returns the
 *  closing speed (0 if not overlapping or already separating). */
function resolveDebrisPair(a: DebrisBody, b: DebrisBody): number {
  _pairNormal.copy(a.pos).sub(b.pos);
  const distSq = _pairNormal.lengthSq();
  const minDist = a.radius + b.radius;
  if (distSq >= minDist * minDist) return 0;

  const dist = Math.sqrt(distSq);
  if (dist > 1e-6) _pairNormal.multiplyScalar(1 / dist);
  else _pairNormal.set(0, 1, 0);

  const invMassA = 1 / (a.radius * a.radius * a.radius);
  const invMassB = 1 / (b.radius * b.radius * b.radius);
  const invMassSum = invMassA + invMassB;

  const overlap = minDist - dist;
  a.pos.addScaledVector(_pairNormal, overlap * (invMassA / invMassSum));
  b.pos.addScaledVector(_pairNormal, -overlap * (invMassB / invMassSum));

  _relVel.copy(a.vel).sub(b.vel);
  const closingSpeed = -_relVel.dot(_pairNormal);
  if (closingSpeed <= 0) return 0;

  const impulse = ((1 + DEBRIS_RESTITUTION) * closingSpeed) / invMassSum;
  a.vel.addScaledVector(_pairNormal, impulse * invMassA);
  b.vel.addScaledVector(_pairNormal, -impulse * invMassB);

  return closingSpeed;
}

/** Reflect-mode debris-vs-asteroid contact, mirroring
 *  `resolveAsteroidCollision`'s belt-local transform (the grid is indexed in
 *  belt-local space; the whole belt rotates as one group each frame). Returns
 *  the largest closing speed observed this call, or 0 if nothing was hit. */
function reflectAsteroidContact(debris: DebrisBody): number {
  const grid = asteroidRuntime.grid;
  if (!grid) return 0;

  const yaw = asteroidRuntime.groupYaw;
  rotateY(debris.pos, -yaw, _localPos);
  rotateY(debris.vel, -yaw, _localVel);

  const candidates = queryNearby(grid, _localPos.x, _localPos.z, debris.radius + MAX_ASTEROID_RADIUS);
  let maxClosing = 0;
  for (const idx of candidates) {
    const s = asteroidRuntime.states[idx];
    if (!s || !s.alive) continue;
    const speed = reflectSphereContact(
      _localPos,
      _localVel,
      s.pos,
      s.radius,
      debris.radius,
      DEBRIS_RESTITUTION,
      DEBRIS_TANGENTIAL_FRICTION,
    );
    if (speed !== null) maxClosing = Math.max(maxClosing, speed);
  }

  rotateY(_localPos, yaw, debris.pos);
  rotateY(_localVel, yaw, debris.vel);
  return maxClosing;
}

/** Chip 1-2 small secondary fragments off a hard-enough bounce and shrink the
 *  parent — never recurses (chips spawn at `cascadeDepth: 1`, and callers
 *  only invoke this for `cascadeDepth === 0` bodies). Chip placement/spin
 *  uses `Math.random()`, per this codebase's convention for purely cosmetic,
 *  non-seeded ejecta (same precedent as `miningSparkRuntime.ts`) — cascade
 *  chips aren't part of the persisted/seeded belt state. */
function spawnCascadeChips(d: DebrisBody): void {
  const chipCount = CHIP_COUNT_RANGE[0] + Math.floor(Math.random() * (CHIP_COUNT_RANGE[1] - CHIP_COUNT_RANGE[0] + 1));
  const chipRadius = d.radius * CHIP_RADIUS_FRAC;

  for (let k = 0; k < chipCount; k++) {
    _chipDir.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
    if (_chipDir.lengthSq() < 1e-6) _chipDir.set(1, 0, 0);
    else _chipDir.normalize();
    _chipAngVel.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(CHIP_SPIN_RATE);

    debrisRuntime.spawn({
      pos: d.pos.clone().addScaledVector(_chipDir, d.radius * 0.5),
      vel: d.vel.clone().addScaledVector(_chipDir, 2 + Math.random() * 2),
      radius: chipRadius,
      isOre: d.isOre,
      resourceType: d.resourceType,
      angVel: _chipAngVel.clone(),
      cascadeDepth: 1,
    });
  }

  d.radius *= PARENT_SHRINK;
}

/**
 * Integrate + resolve every debris body one frame. Contact bounces rather
 * than sticking; only lifetime timeout or distance-cull remove a fragment
 * (swap-removed from `list` in place). `shipPos` drives the distance-cull;
 * `simTimeDays` is needed for the planet sphere test (bodies move in the sim
 * clock).
 */
export function updateDebrisBodies(
  list: DebrisBody[],
  dt: number,
  simTimeDays: number,
  shipPos: Vector3,
  maxLifeSec: number,
  cullDistance: number,
): void {
  if (_pairClosing.length < list.length) _pairClosing.length = list.length;
  for (let k = 0; k < list.length; k++) _pairClosing[k] = 0;

  for (let i = list.length - 1; i >= 0; i--) {
    const d = list[i];
    d.life += dt;

    const expired = d.life >= maxLifeSec || d.pos.distanceTo(shipPos) > cullDistance;

    if (!expired) {
      integrate(d.pos, d.vel, ZERO_ACCEL, DEBRIS_DAMPING, dt);
      if (d.angVel.lengthSq() > 1e-8) {
        _spinAxis.copy(d.angVel).normalize();
        _spinDeltaQ.setFromAxisAngle(_spinAxis, d.angVel.length() * dt);
        d.quat.multiply(_spinDeltaQ);
      }

      let closing = _pairClosing[i];
      closing = Math.max(
        closing,
        reflectSphereVsPlanets(d.pos, d.vel, simTimeDays, d.radius, DEBRIS_RESTITUTION, DEBRIS_TANGENTIAL_FRICTION),
      );
      closing = Math.max(closing, reflectAsteroidContact(d));

      // Debris-vs-debris: only check against lower indices, so each
      // unordered pair is resolved exactly once per frame (the pair is
      // covered when the outer loop reaches the larger of the two indices).
      for (let j = 0; j < i; j++) {
        const speed = resolveDebrisPair(d, list[j]);
        if (speed > 0) {
          closing = Math.max(closing, speed);
          _pairClosing[j] = Math.max(_pairClosing[j], speed);
        }
      }

      if (d.cascadeDepth === 0 && closing > SECONDARY_FRACTURE_SPEED) {
        spawnCascadeChips(d);
      }
    }

    if (expired) {
      list[i] = list[list.length - 1];
      list.pop();
    }
  }
}

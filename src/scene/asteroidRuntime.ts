// Hot-path singleton exposing the asteroid belt's per-instance state and
// spatial grid to code outside the AsteroidBelt component tree (ship
// collision, mining, fracture) — same convention as `shipTelemetry.ts`: a
// plain mutable object read/written every frame, never a store subscription,
// since a store subscription here would re-render on every belt rebuild.

import type { BufferGeometry, Quaternion, Vector3 } from 'three';
import type { AsteroidState } from '../systems/asteroidState';
import type { AsteroidGrid } from '../systems/asteroidGrid';

/** Inputs the fracture momentum formula needs: the (promoted or, on
 *  graceful-degradation, freshly-recomputed pristine) asteroid's angular
 *  velocity, orientation, and scale, so a fragment's initial velocity can
 *  include "parent angular velocity × offset-from-center" (rigid-body point
 *  velocity), not just the impact's own direction/force. */
export interface AsteroidMomentumInputs {
  angVel: Vector3;
  quat: Quaternion;
  scale: Vector3;
}

/** Set by AsteroidBelt.tsx once a belt is mounted — the promotion API for
 *  pulling a hit asteroid out of its shared InstancedMesh into a standalone,
 *  individually deformable mesh (see asteroidFracture.ts's `applyAsteroidDamage`,
 *  which is the only caller). Null when no belt is mounted. */
export interface AsteroidPromotionApi {
  /** Attempt to promote `globalIdx` (no-op, returns true, if already
   *  promoted). Returns false if ineligible (dust tier) or over budget —
   *  callers must gracefully fall back to health-only behavior on false. */
  promote: (globalIdx: number) => boolean;
  /** Locally dent a promoted asteroid's geometry at a world-space impact
   *  point. No-op if `globalIdx` isn't promoted. */
  applyDent: (globalIdx: number, worldImpactPoint: Vector3, amount: number) => void;
  /** Never null for a live asteroid — promoted asteroids report their live
   *  physical state; non-promoted ones report a freshly-recomputed pristine
   *  placement (graceful degradation, no null case needed by callers). */
  getMomentumInputs: (globalIdx: number) => AsteroidMomentumInputs | null;
  /** The geometry to fracture: the promoted mesh's live (possibly dented)
   *  geometry if promoted, otherwise the shared pristine base geometry for
   *  that (tier, variant) — never null for a live asteroid. */
  getSourceGeometry: (globalIdx: number) => BufferGeometry | null;
}

export const asteroidRuntime: {
  states: AsteroidState[];
  grid: AsteroidGrid | null;
  /** Belt-local yaw applied this frame (the whole-belt orbital drift) — ship/
   *  debris code must undo this before querying the grid, since the grid is
   *  built and indexed in belt-local space. */
  groupYaw: number;
  /** Set by AsteroidBelt.tsx on (re)build; zeroes the given asteroid's
   *  render instance and marks it dead. Null when no belt is mounted
   *  (e.g. quality 'low', asteroids: 0) — callers must check before use. */
  killAsteroid: ((globalIdx: number) => void) | null;
  promotion: AsteroidPromotionApi | null;
} = {
  states: [],
  grid: null,
  groupYaw: 0,
  killAsteroid: null,
  promotion: null,
};

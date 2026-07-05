// Per-asteroid identity/mutable-state, coexisting with the InstancedMesh-only
// rendering in AsteroidBelt.tsx. Asteroids have no individual JS identity
// beyond their baked transform matrix; this is the parallel plain-array-of-
// structs that gives them one — health, indestructibility, alive/dead — index-
// aligned with (but not stored inside) each InstancedMesh's instance index.
// Mirrors the `Debris[]` convention already used for voxel mining debris
// (`src/voxel/ChunkManager.tsx`), not a Map or class hierarchy.

import type { Vector3 } from 'three';
import { placeAsteroid, computeTierVariantCounts, BELT_SEED } from './asteroidLayout';

export interface AsteroidState {
  tierIdx: number;
  variantIdx: number;
  /** Index within this asteroid's (tier, variant) InstancedMesh. */
  instIdx: number;
  pos: Vector3;
  /** Approximate bounding radius (world units), from the baked scale. */
  radius: number;
  health: number;
  maxHealth: number;
  seed: number;
  alive: boolean;
  /** Narrative-anchored asteroids (§9) no-op on damage. */
  indestructible: boolean;
  /** Incremented on every damage hit — feeds the deterministic debris-spawn
   *  hash so repeated hits on the same rock don't collide on identical
   *  hash inputs (see asteroidFracture.ts). */
  hitSeq: number;
}

/** Bigger rocks take more hits to fracture — scales with bounding radius. */
function maxHealthForRadius(radius: number): number {
  return 8 + radius * 18;
}

/**
 * Builds the full per-asteroid state array for a given quality tier's
 * instance `count`. Iterates `computeTierVariantCounts` — the exact same
 * group order/sizes `AsteroidBelt.tsx`'s render loop uses — so a state
 * array index (`globalIdx`) and the render loop's running instance counter
 * always agree without either side needing to share mutable data.
 */
export function buildAsteroidStates(count: number, seed: number = BELT_SEED): AsteroidState[] {
  const states: AsteroidState[] = [];
  for (const g of computeTierVariantCounts(count)) {
    for (let i = 0; i < g.n; i++) {
      const placed = placeAsteroid(g.tierIdx, g.variantIdx, i, seed);
      const maxHealth = maxHealthForRadius(placed.radius);
      states.push({
        tierIdx: g.tierIdx,
        variantIdx: g.variantIdx,
        instIdx: i,
        pos: placed.pos.clone(),
        radius: placed.radius,
        health: maxHealth,
        maxHealth,
        seed,
        alive: true,
        indestructible: false,
        hitSeq: 0,
      });
    }
  }
  return states;
}


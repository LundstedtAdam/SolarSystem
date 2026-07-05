// Deterministic asteroid-belt placement. Replaces the old unseeded
// `Math.random()` generation (every quality-tier rebuild used to reshuffle
// the whole belt) with a pure function of `(tier, variant, index, seed)`,
// using the same `cellHash`/`seedFromName` primitives already established
// for voxel POI placement (`src/voxel/noise.ts`, `src/voxel/worldGen.ts`) —
// no new PRNG.
//
// Determinism contract: `placeAsteroid(tier, variantIdx, i, seed)` depends
// only on its own arguments, never on the total instance count for the
// tier/quality. That means a lower quality tier's asteroids are always a
// strict prefix of a higher tier's — index `i` names the same physical rock
// at every quality setting, which lets narrative content anchor a wreck to a
// specific asteroid (`globalIdx`) without it moving when the player changes
// quality.

import { Vector3, Quaternion, Euler } from 'three';
import { cellHash, seedFromName } from '../voxel/noise';
import { WORLD_SCALE } from './bodies';

export const BELT_SEED = seedFromName('sol-asteroid-belt');

// Belt sits between Mars and Jupiter, kept inside Jupiter's inner moon shell
// so nothing crosses orbits. Scaled by WORLD_SCALE alongside the body layout.
export const INNER = 645 * WORLD_SCALE;
export const OUTER = 755 * WORLD_SCALE;
export const THICKNESS = 16 * WORLD_SCALE; // full vertical spread; concentrated toward the plane

/**
 * Size/detail tiers — a realistic belt is mostly dust with a few large
 * bodies. Geometry detail (poly count) scales with size so the big rocks
 * that read up close are high-poly, while the abundant tiny ones stay cheap.
 * Only the larger, visibly-tumbling tiers animate per frame.
 */
export const TIERS = [
  { frac: 0.78, detail: 0, min: 0.12, max: 0.5, variants: 1, rotates: false },
  { frac: 0.18, detail: 1, min: 0.5, max: 1.9, variants: 2, rotates: true },
  { frac: 0.04, detail: 2, min: 1.9, max: 5.2, variants: 3, rotates: true },
] as const;

// Structured (not uniform) placement: the belt is split into angular sectors
// whose density multiplier is itself deterministic (§3a — gap sectors read as
// flyable corridors, dense sectors anchor resource-cluster POIs). Assigning
// each index's sector via a weighted hash (rather than dropping/adding
// instances per sector) keeps the "lower tier is a prefix of higher tier"
// guarantee — the weighting only biases *which* sector an index lands in,
// it never changes how many indices exist.
const SECTOR_COUNT = 24;
const SECTOR_DENSITY_BANDS = [0.15, 0.6, 1.0, 1.6]; // gap / sparse / normal / dense

const SALT = {
  sectorDensity: 101,
  sectorPick: 1,
  sectorFrac: 2,
  radius: 3,
  y: 4,
  yBias: 15,
  scaleBase: 5,
  scaleY: 6,
  scaleZ: 7,
  eulerX: 8,
  eulerY: 9,
  eulerZ: 10,
  tumbleAxisTheta: 11,
  tumbleAxisPhi: 12,
  tumbleSpeed: 13,
  tumblePhase: 14,
};

/** Sector weight (0..1.6ish) from a deterministic hash — computed once. */
const sectorCumWeight: number[] = (() => {
  const cum: number[] = [];
  let total = 0;
  for (let s = 0; s < SECTOR_COUNT; s++) {
    const h = cellHash(s, 0, BELT_SEED + SALT.sectorDensity);
    const band = Math.min(3, Math.floor(h * 4));
    total += SECTOR_DENSITY_BANDS[band];
    cum.push(total);
  }
  for (let s = 0; s < SECTOR_COUNT; s++) cum[s] /= total;
  return cum;
})();

function pickSector(h: number): number {
  for (let s = 0; s < SECTOR_COUNT; s++) {
    if (h < sectorCumWeight[s]) return s;
  }
  return SECTOR_COUNT - 1;
}

export interface TierVariantGroup {
  tierIdx: number;
  variantIdx: number;
  n: number;
}

/**
 * Shared tier/variant instance-count split, used identically by the render
 * loop (`AsteroidBelt.tsx`) and the parallel per-asteroid state array
 * (`asteroidState.ts`) so the two never drift out of sync — both must agree
 * on exactly which (tier, variant, i) triples exist for a given quality
 * tier's `count`.
 */
export function computeTierVariantCounts(count: number): TierVariantGroup[] {
  const groups: TierVariantGroup[] = [];
  for (let tierIdx = 0; tierIdx < TIERS.length; tierIdx++) {
    const tier = TIERS[tierIdx];
    const tierCount = Math.round(count * tier.frac);
    if (tierCount === 0) continue;
    for (let variantIdx = 0; variantIdx < tier.variants; variantIdx++) {
      const n =
        Math.floor(tierCount / tier.variants) + (variantIdx < tierCount % tier.variants ? 1 : 0);
      if (n === 0) continue;
      groups.push({ tierIdx, variantIdx, n });
    }
  }
  return groups;
}

export interface PlacedAsteroid {
  pos: Vector3;
  scale: Vector3;
  quat: Quaternion;
  radius: number; // approximate bounding radius (~max scale axis)
  /** Only set for tiers marked `rotates: true`. */
  tumbleAxis?: Vector3;
  tumbleSpeed?: number;
  tumblePhase?: number;
}

const _euler = new Euler();

/**
 * Deterministic placement for one asteroid instance. `tierVariantAxis`
 * combines the tier and variant indices into the hash's second axis so
 * different tiers/variants never share a hash stream at the same `i`.
 */
export function placeAsteroid(
  tierIdx: number,
  variantIdx: number,
  i: number,
  seed: number,
): PlacedAsteroid {
  const tier = TIERS[tierIdx];
  const z = tierIdx * 100 + variantIdx;

  // Sector-weighted angle (structured placement, §3a).
  const hSector = cellHash(i, z, seed + SALT.sectorPick);
  const sector = pickSector(hSector);
  const hFrac = cellHash(i, z, seed + SALT.sectorFrac);
  const sectorWidth = (Math.PI * 2) / SECTOR_COUNT;
  const angle = (sector + hFrac) * sectorWidth;

  const r = INNER + cellHash(i, z, seed + SALT.radius) * (OUTER - INNER);
  // Concentrate toward the orbital plane: sign+magnitude from one hash, a
  // second hash squared biases the distribution toward zero (thin disc),
  // mirroring the original `(rand-0.5) * rand^2 * THICKNESS` shape.
  const ySign = cellHash(i, z, seed + SALT.y) - 0.5;
  const yBias = cellHash(i, z, seed + SALT.yBias);
  const y = ySign * (yBias * yBias) * THICKNESS;

  const pos = new Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r);

  const base = tier.min + cellHash(i, z, seed + SALT.scaleBase) * (tier.max - tier.min);
  const scale = new Vector3(
    base,
    base * (0.6 + cellHash(i, z, seed + SALT.scaleY) * 0.7),
    base * (0.7 + cellHash(i, z, seed + SALT.scaleZ) * 0.6),
  );

  _euler.set(
    cellHash(i, z, seed + SALT.eulerX) * Math.PI * 2,
    cellHash(i, z, seed + SALT.eulerY) * Math.PI * 2,
    cellHash(i, z, seed + SALT.eulerZ) * Math.PI * 2,
  );
  const quat = new Quaternion().setFromEuler(_euler);

  const result: PlacedAsteroid = {
    pos,
    scale,
    quat,
    radius: Math.max(scale.x, scale.y, scale.z),
  };

  if (tier.rotates) {
    const theta = cellHash(i, z, seed + SALT.tumbleAxisTheta) * Math.PI * 2;
    const phi = Math.acos(cellHash(i, z, seed + SALT.tumbleAxisPhi) * 2 - 1);
    result.tumbleAxis = new Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.sin(phi) * Math.sin(theta),
      Math.cos(phi),
    );
    result.tumbleSpeed = 0.05 + cellHash(i, z, seed + SALT.tumbleSpeed) * 0.25;
    result.tumblePhase = cellHash(i, z, seed + SALT.tumblePhase) * Math.PI * 2;
  }

  return result;
}

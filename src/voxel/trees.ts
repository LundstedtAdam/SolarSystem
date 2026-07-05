// Material Identity pass — choppable, voxel-embedded trees. Reuses
// structures.ts's SVoxel/BuiltStructure contract and rng32 PRNG so a tree is
// just another deterministic voxel assembly stamped into the chunk grid by
// worldGen.ts (see stampTrees) — not a separate entity/rendering system, per
// the requirement that trees "reuse the voxel/chunk system only". Earth only;
// the "ambiguous alien growth" decorative variant on theoretical/inconclusive
// bodies stays the older, non-voxel VoxelTrees.tsx system (treeProfiles.ts).
//
// Deliberately a small parameterized prefab (trunk column + a thinned,
// squashed-sphere canopy blob), not a full L-system — cheap, deterministic,
// and already reads as "tree" at voxel-game viewing distances (see the old
// treeProfiles.ts's identical scope note, whose tuning is migrated here).

import { rng32, type SVoxel, type BuiltStructure } from './structures';
import { BLOCK } from './voxelTypes';

export interface TreeParams {
  minHeight: number;
  maxHeight: number;
  /** Canopy sphere radius as a fraction of the tree's own trunk height. */
  canopyRadiusFactor: number;
}

/** Migrated 1:1 from the old treeProfiles.ts earthForest() species tuning. */
export const EARTH_TREE_PARAMS: TreeParams = { minHeight: 4, maxHeight: 9, canopyRadiusFactor: 0.4 };

/** Placement tuning, also migrated from the old cosmetic profile — consumed
 *  by worldGen.ts's stampTrees, which replaces the old InstancedMesh forest
 *  with real voxel placement using these same density/clustering numbers. */
export const EARTH_TREE_DENSITY = 0.22;
export const EARTH_TREE_CELL = 4;
export const EARTH_TREE_FOREST_FREQ = 0.006;
export const EARTH_TREE_FOREST_THRESHOLD = 0.52;

/** Largest horizontal half-extent a tree can reach from its anchor — mirrors
 *  structures.ts's POI_MAX_HALF_EXTENT, generous vs. the tallest authored tree. */
export const TREE_MAX_HALF_EXTENT = 8;

function buildTree(seed: number, p: TreeParams): BuiltStructure {
  const rng = rng32(seed);
  const height = Math.round(p.minHeight + rng() * (p.maxHeight - p.minHeight));

  const voxels: SVoxel[] = [];
  for (let y = 0; y < height; y++) voxels.push({ x: 0, y, z: 0, block: BLOCK.WOOD_LOG });

  // Squashed-sphere canopy blob centred just below the trunk top, with a
  // rng-thinned outer shell so the silhouette isn't a perfect ball.
  const canopyR = Math.max(2, Math.round(height * p.canopyRadiusFactor));
  const canopyCenterY = height - 1;
  for (let dy = -canopyR; dy <= canopyR; dy++) {
    const y = canopyCenterY + dy;
    if (y < 1) continue; // never let canopy dip to/below the ground plane
    for (let dz = -canopyR; dz <= canopyR; dz++) {
      for (let dx = -canopyR; dx <= canopyR; dx++) {
        if (dx === 0 && dz === 0 && y < height) continue; // don't overwrite the trunk core
        const d = Math.sqrt(dx * dx + dy * dy * 1.3 + dz * dz); // slightly squashed vertically
        if (d > canopyR) continue;
        const edge = d / canopyR;
        if (edge > 0.75 && rng() < (edge - 0.75) * 2) continue;
        voxels.push({ x: dx, y, z: dz, block: BLOCK.LEAVES });
      }
    }
  }

  // Normalize to a floor-min-corner-anchored contract, matching structures.ts's
  // build() so stampTrees can reuse stampPOIs's exact centering math unmodified.
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  let maxY = 0;
  for (const v of voxels) {
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minZ = Math.min(minZ, v.z);
    maxZ = Math.max(maxZ, v.z);
    maxY = Math.max(maxY, v.y);
  }
  const normalized = voxels.map((v) => ({ x: v.x - minX, y: v.y, z: v.z - minZ, block: v.block }));
  return { voxels: normalized, footprint: [maxX - minX + 1, maxZ - minZ + 1], height: maxY + 1 };
}

// Cache built trees so a tree overlapping several chunks is generated once —
// same FIFO idiom as structures.ts's POI cache.
const cache = new Map<number, BuiltStructure>();
const CACHE_MAX = 64;

/** Generate (or fetch cached) a deterministic tree voxel assembly for a seed. */
export function generateTree(seed: number): BuiltStructure {
  const hit = cache.get(seed);
  if (hit) return hit;
  const built = buildTree(seed, EARTH_TREE_PARAMS);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as number);
  cache.set(seed, built);
  return built;
}

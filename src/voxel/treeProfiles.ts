// World Richness Phase 7 — cosmetic (non-voxel) procedural trees. A tree is a
// small parameterized prefab (trunk + optional canopy sphere), not a full
// L-system: cheap, deterministic, and easy to instance (VoxelTrees.tsx).
//
// Material Identity pass: Earth's forest is no longer generated here — real
// trees are now voxel-embedded, choppable assemblies stamped directly into
// the chunk grid (see trees.ts's generateTree + worldGen.ts's stampTrees),
// which lets them be mined for wood like any other terrain. This file now
// only covers the sparse, deliberately ambiguous alien-analog growths on
// bodies whose life question is still open (lifeAmbiguous in
// contentProfiles.ts) — the same narrative gate the ground-clutter scatter
// uses. Those stay purely decorative/non-interactive by design (chopping
// wouldn't fit their deliberately-ambiguous framing), so they keep the older
// cosmetic InstancedMesh system unchanged. Every other body gets no trees.
//
// Scope note: this deliberately does not attempt visible branch geometry,
// exposed roots, or hollow trunks — a canopy sphere on a trunk cylinder
// already reads as "tree" at voxel-game viewing distances, and adding a
// third instanced part per tree for branches alone wasn't judged worth the
// added complexity this round. Age variation (height range), species colour
// per body, dead trees (no canopy) and fallen trees (trunk lying down) are
// all covered by the two-part prefab below.

import { getBiome } from '../terrain/biomes';
import { archetypeFor } from './voxelBiomes';
import { lifeAmbiguous } from './contentProfiles';

export interface TreeSpecies {
  trunkColor: [number, number, number];
  canopyColor: [number, number, number];
  canopyEmissive: [number, number, number];
  canopyEmissiveIntensity: number;
  minHeight: number;
  maxHeight: number;
  trunkRadius: number;
  /** Canopy sphere radius as a fraction of the tree's own height. */
  canopyRadiusFactor: number;
  /** Probability [0,1] an individual tree has no canopy (a dead snag). */
  deadChance: number;
  /** Probability an individual tree lies on the ground instead of standing
   *  (same trunk geometry, reoriented per-instance — no separate part). */
  fallenChance: number;
}

export interface TreeProfile {
  species: TreeSpecies;
  /** Probability a forest-coverage cell holds a tree at all. */
  density: number;
  /** Placement cell size (voxels). */
  cell: number;
  /** Low-frequency coverage-mask frequency — clusters trees into groves with
   *  clearings between them instead of a uniform scatter. */
  forestFreq: number;
  /** Minimum coverage-noise value (0..1) required for trees to grow at all. */
  forestThreshold: number;
}

/** Sparse, deliberately ambiguous alien-analog growths — tinted from the
 *  body's own high-elevation colour (same approach as scatterProfiles.ts's
 *  ambiguousGrowth) so each qualifying world's growths read as belonging to
 *  that world, not a recoloured Earth tree. Much sparser and smaller than
 *  the Earth forest, and never claims to be alive in any accompanying text. */
function ambiguousGrowths(planet: string): TreeProfile {
  const b = getBiome(planet);
  return {
    species: {
      trunkColor: [b.colorLow[0] * 0.6, b.colorLow[1] * 0.6, b.colorLow[2] * 0.65],
      canopyColor: [b.colorHigh[0] * 0.7 + 0.1, b.colorHigh[1] * 0.6 + 0.05, b.colorHigh[2] * 0.7 + 0.15],
      canopyEmissive: [b.colorHigh[0] * 0.25, b.colorHigh[1] * 0.2, b.colorHigh[2] * 0.3],
      canopyEmissiveIntensity: 0.2,
      minHeight: 3,
      maxHeight: 6,
      trunkRadius: 0.3,
      canopyRadiusFactor: 0.35,
      deadChance: 0.15,
      fallenChance: 0.05,
    },
    density: 0.05,
    cell: 10,
    forestFreq: 0.01,
    forestThreshold: 0.6,
  };
}

/** Cosmetic (non-voxel) tree profiles for a body: a sparse ambiguous grove on
 *  bodies whose life question is still open, none anywhere else. Earth is
 *  excluded explicitly (even though its own baseline science note also
 *  satisfies lifeAmbiguous) because its real forest is voxel-embedded now
 *  (see trees.ts/worldGen.ts's stampTrees) — the two systems never coexist
 *  on the same body. */
export function getTrees(planet: string): TreeProfile[] {
  if (archetypeFor(planet) === 'earth') return [];
  if (lifeAmbiguous(planet)) return [ambiguousGrowths(planet)];
  return [];
}

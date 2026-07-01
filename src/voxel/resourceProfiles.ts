// Phase 11 — per-body resource veins. Resources are biome-grouped exactly like
// the spec: three universal fundamentals on every world, a biome primary +
// secondary per archetype, and a deep rare artifact in hostile (lava) cores.
// Each vein is a deterministic 3D-noise mask sampled in worldGen, so a vein is
// reproducible from the seed and never needs storing.

import { BLOCK, type ResourceType } from './voxelTypes';
import type { Archetype } from './voxelBiomes';

/** Display name per resource — shared by the backpack, silos and crafting UI. */
export const RESOURCE_LABEL: Record<ResourceType, string> = {
  carbon: 'Carbon',
  silicon: 'Silicon',
  iron: 'Iron',
  copper: 'Copper',
  zinc: 'Zinc',
  wolframite: 'Wolframite',
  sphalerite: 'Sphalerite',
  malachite: 'Malachite',
  tungsten: 'Tungsten',
  titanite: 'Titanite',
  hematite: 'Hematite',
  lithium: 'Lithium',
  artifact: 'Artifact',
};

/** Display colour per resource — shared by ground drops and silo stacks. */
export const RESOURCE_COLOR: Record<ResourceType, [number, number, number]> = {
  carbon: [0.2, 0.2, 0.22],
  silicon: [0.6, 0.62, 0.68],
  iron: [0.5, 0.34, 0.26],
  copper: [0.72, 0.45, 0.2],
  zinc: [0.55, 0.6, 0.62],
  wolframite: [0.3, 0.25, 0.22],
  sphalerite: [0.56, 0.46, 0.2],
  malachite: [0.15, 0.55, 0.35],
  tungsten: [0.46, 0.48, 0.51],
  titanite: [0.7, 0.55, 0.25],
  hematite: [0.52, 0.29, 0.27],
  lithium: [0.85, 0.6, 0.7],
  artifact: [0.6, 0.3, 0.9],
};

export interface ResourceVein {
  /** Ore block id placed where the vein mask is solid (see voxelTypes BLOCK). */
  block: number;
  /** Noise frequency — lower = larger, blobbier veins. */
  freq: number;
  /** Mask threshold 0..1 — higher = rarer. */
  threshold: number;
  /** Inclusive surface-relative depth band the vein may appear in (voxels). */
  minDepth: number;
  maxDepth: number;
  /** Independent noise salt so veins don't correlate. */
  salt: number;
}

// Universal fundamentals — present on every body, common, shallow-to-mid.
const FUNDAMENTALS: ResourceVein[] = [
  { block: BLOCK.CARBON_ORE, freq: 0.14, threshold: 0.8, minDepth: 2, maxDepth: 60, salt: 1401 },
  { block: BLOCK.SILICON_ORE, freq: 0.14, threshold: 0.81, minDepth: 2, maxDepth: 60, salt: 1402 },
  { block: BLOCK.IRON_ORE, freq: 0.12, threshold: 0.83, minDepth: 5, maxDepth: 120, salt: 1403 },
];

// Biome primary/secondary by archetype (rock + dune share the arid group).
const BIOME: Record<Archetype, ResourceVein[]> = {
  earth: [
    { block: BLOCK.COPPER_ORE, freq: 0.13, threshold: 0.82, minDepth: 4, maxDepth: 90, salt: 2101 },
    { block: BLOCK.ZINC_ORE, freq: 0.13, threshold: 0.85, minDepth: 8, maxDepth: 120, salt: 2102 },
  ],
  regolith: [
    { block: BLOCK.WOLFRAMITE_ORE, freq: 0.13, threshold: 0.83, minDepth: 4, maxDepth: 100, salt: 2201 },
    { block: BLOCK.SPHALERITE_ORE, freq: 0.13, threshold: 0.85, minDepth: 8, maxDepth: 120, salt: 2202 },
  ],
  rock: [
    { block: BLOCK.MALACHITE_ORE, freq: 0.13, threshold: 0.83, minDepth: 4, maxDepth: 100, salt: 2301 },
    { block: BLOCK.TUNGSTEN_ORE, freq: 0.12, threshold: 0.86, minDepth: 12, maxDepth: 140, salt: 2302 },
  ],
  dune: [
    { block: BLOCK.MALACHITE_ORE, freq: 0.13, threshold: 0.83, minDepth: 4, maxDepth: 100, salt: 2301 },
    { block: BLOCK.TUNGSTEN_ORE, freq: 0.12, threshold: 0.86, minDepth: 12, maxDepth: 140, salt: 2302 },
  ],
  ice: [
    { block: BLOCK.TITANITE_ORE, freq: 0.13, threshold: 0.84, minDepth: 6, maxDepth: 110, salt: 2401 },
    { block: BLOCK.HEMATITE_ORE, freq: 0.13, threshold: 0.85, minDepth: 10, maxDepth: 130, salt: 2402 },
  ],
  lava: [
    { block: BLOCK.LITHIUM_ORE, freq: 0.13, threshold: 0.83, minDepth: 6, maxDepth: 120, salt: 2501 },
    // Anomalous artifacts: rare, only deep in hostile cores — endgame drives.
    { block: BLOCK.ARTIFACT, freq: 0.1, threshold: 0.9, minDepth: 40, maxDepth: 200, salt: 2599 },
  ],
};

/** All ore veins for a body, fundamentals first then the biome pair. */
export function getBodyResources(archetype: Archetype): ResourceVein[] {
  return [...FUNDAMENTALS, ...(BIOME[archetype] ?? [])];
}

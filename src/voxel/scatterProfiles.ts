// Per-body surface scatter (variation layer 3). One InstancedMesh of props per
// body, placed deterministically on the terrain: dead rocks on the Moon, sulphur
// crystals on Io, ice spires on Europa, fungal blooms on Titan, scattered rocks
// on Mars/Earth. Same ground, very different feel. Colours come from the biome.

import { getBiome } from '../terrain/biomes';
import { archetypeFor } from './voxelBiomes';

export type ScatterKind = 'rock' | 'crystal' | 'spire' | 'fungus' | 'slab';

export interface ScatterProfile {
  kind: ScatterKind;
  color: [number, number, number];
  emissive: [number, number, number];
  emissiveIntensity: number;
  /** Probability a scatter cell holds a prop. */
  density: number;
  /** Scatter cell size in voxels. */
  cell: number;
  minScale: number;
  maxScale: number;
  /** Non-uniform scale multipliers (x, y, z) applied to the unit geometry. */
  scaleXYZ: [number, number, number];
  /** Fraction of (scale·yExtent) used to raise the centre so the base sits on
   *  the ground (and embeds slightly). */
  yFactor: number;
}

export function getScatter(planet: string): ScatterProfile {
  const b = getBiome(planet);
  switch (archetypeFor(planet)) {
    case 'regolith': // dead boulders
      return {
        kind: 'rock', color: b.colorMid, emissive: [0, 0, 0], emissiveIntensity: 0,
        density: 0.45, cell: 6, minScale: 0.6, maxScale: 1.7, scaleXYZ: [1, 0.8, 1], yFactor: 0.3,
      };
    case 'rock': // Mars/Miranda — sparse low rocks
      return {
        kind: 'rock', color: b.colorLow, emissive: [0, 0, 0], emissiveIntensity: 0,
        density: 0.32, cell: 7, minScale: 0.5, maxScale: 1.3, scaleXYZ: [1, 0.7, 1], yFactor: 0.28,
      };
    case 'ice': // glowing ice spires
      return {
        kind: 'spire', color: b.colorHigh, emissive: [0.3, 0.55, 1.0], emissiveIntensity: 0.5,
        density: 0.4, cell: 7, minScale: 0.8, maxScale: 2.4, scaleXYZ: [0.5, 1, 0.5], yFactor: 0.55,
      };
    case 'lava': // sulphur crystals
      return {
        kind: 'crystal', color: [0.86, 0.74, 0.18], emissive: [0.9, 0.5, 0.1], emissiveIntensity: 0.3,
        density: 0.42, cell: 6, minScale: 0.5, maxScale: 1.5, scaleXYZ: [0.6, 1.4, 0.6], yFactor: 0.7,
      };
    case 'dune': // Titan fungal blooms
      return {
        kind: 'fungus', color: [0.55, 0.4, 0.62], emissive: [0.25, 0.4, 0.5], emissiveIntensity: 0.25,
        density: 0.35, cell: 8, minScale: 0.6, maxScale: 1.6, scaleXYZ: [1, 0.75, 1], yFactor: 0.34,
      };
    default: // earth — mossy rocks
      return {
        kind: 'rock', color: [b.colorHigh[0] * 0.6, b.colorHigh[1] * 0.7, b.colorHigh[2] * 0.4],
        emissive: [0, 0, 0], emissiveIntensity: 0,
        density: 0.28, cell: 7, minScale: 0.5, maxScale: 1.4, scaleXYZ: [1, 0.8, 1], yFactor: 0.3,
      };
  }
}

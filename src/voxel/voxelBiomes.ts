// Maps the shared Phase 8 BiomeProfile onto voxel-world parameters: the block
// colour palette and the procedural terrain shape. This keeps the voxel world's
// colour identity locked to the same source of truth as the Phase 8 surface.
//
// 9.1 derives reasonable values for every body from the existing biome fields.
// 9.4 refines per-archetype block sets, geology and structures on top of this.

import { getBiome } from '../terrain/biomes';
import { BLOCK_COUNT, BLOCK } from './voxelTypes';

export interface VoxelTerrainParams {
  /** Mean surface height in voxels above the world floor (y=0). */
  baseHeight: number;
  /** Low-frequency rolling relief. */
  rollAmp: number;
  rollFreq: number;
  /** Higher-frequency mountain relief; `ridged` gives sharp crests. */
  mountainAmp: number;
  mountainFreq: number;
  ridged: boolean;
  octaves: number;
  /** 3D cave carving. Higher threshold = fewer/smaller caves. */
  caveFreq: number;
  caveThreshold: number;
}

/** Flat RGB palette (BLOCK_COUNT * 3, values 0..1) indexed by block id. The
 *  worker multiplies these by ambient occlusion to colour vertices. */
export function getVoxelPalette(planet: string): Float32Array {
  const b = getBiome(planet);
  const pal = new Float32Array(BLOCK_COUNT * 3);
  // AIR (id 0) stays black/unused.
  const set = (id: number, rgb: [number, number, number], scale = 1) => {
    pal[id * 3] = rgb[0] * scale;
    pal[id * 3 + 1] = rgb[1] * scale;
    pal[id * 3 + 2] = rgb[2] * scale;
  };
  set(BLOCK.SURFACE, b.colorMid);
  set(BLOCK.SUBSOIL, b.colorLow);
  set(BLOCK.ROCK, b.colorLow, 0.55);
  return pal;
}

export function getVoxelTerrain(planet: string): VoxelTerrainParams {
  const b = getBiome(planet);
  // Relief scales with the body's macro amplitude so Mars reads as rugged,
  // the Moon flatter, etc. — all from the same biome numbers.
  const relief = b.continentAmp + b.mountainAmp;
  return {
    baseHeight: 40,
    rollAmp: Math.min(6 + relief * 0.35, 26),
    rollFreq: 1 / 80,
    mountainAmp: Math.min(b.mountainAmp * 0.8, 22),
    mountainFreq: 1 / 36,
    ridged: b.mountainAmp >= 12,
    octaves: Math.max(3, b.octaves),
    caveFreq: 0.07,
    // Airless/rocky bodies get slightly more open caverns than icy/sandy ones.
    caveThreshold: 0.8,
  };
}

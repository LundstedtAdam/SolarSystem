// Procedural per-chunk generation. Runs on the main thread (cheap CPU noise),
// fills the chunk's bit-packed Uint32Array, then reapplies any persisted edits.
// Deterministic per body via a name-derived seed.

import { Vector3 } from 'three';
import { CHUNK_SIZE, chunkIndex, packVoxel, BLOCK } from './voxelTypes';
import { fbm2, valueNoise3, seedFromName } from './noise';
import type { Chunk } from './chunk';
import { getVoxelTerrain, type VoxelTerrainParams } from './voxelBiomes';

/** Surface height (in voxels) of the column at world (wx, wz). */
function columnHeight(wx: number, wz: number, p: VoxelTerrainParams, seed: number): number {
  const roll = (fbm2(wx * p.rollFreq, wz * p.rollFreq, seed, p.octaves) * 2 - 1) * p.rollAmp;
  const mRaw = fbm2(wx * p.mountainFreq, wz * p.mountainFreq, seed + 7919, p.octaves);
  const mountain = (p.ridged ? 1 - Math.abs(mRaw * 2 - 1) : mRaw) * p.mountainAmp;
  return Math.floor(p.baseHeight + roll + mountain);
}

export function generateChunk(
  chunk: Chunk,
  params: VoxelTerrainParams,
  seed: number,
): void {
  const { voxels } = chunk;
  const baseX = chunk.cx * CHUNK_SIZE;
  const baseY = chunk.cy * CHUNK_SIZE;
  const baseZ = chunk.cz * CHUNK_SIZE;
  voxels.fill(0);

  const AIR = packVoxel(BLOCK.AIR);
  const SURFACE = packVoxel(BLOCK.SURFACE);
  const SUBSOIL = packVoxel(BLOCK.SUBSOIL);
  const ROCK = packVoxel(BLOCK.ROCK);

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    const wx = baseX + lx;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wz = baseZ + lz;
      const h = columnHeight(wx, wz, params, seed);
      // Skip columns entirely above this chunk (all air).
      if (baseY > h) continue;
      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        const wy = baseY + ly;
        if (wy > h) continue; // air above the surface
        let block: number;
        if (wy <= 0) {
          block = ROCK; // solid floor — never fall out the bottom
        } else {
          // Carve caves below the surface skin; keep the top 2 voxels solid.
          const depth = h - wy;
          if (
            depth > 2 &&
            valueNoise3(wx * params.caveFreq, wy * params.caveFreq, wz * params.caveFreq, seed + 4201) >
              params.caveThreshold
          ) {
            block = AIR;
          } else if (depth <= 0) {
            block = SURFACE;
          } else if (depth <= 4) {
            block = SUBSOIL;
          } else {
            block = ROCK;
          }
        }
        if (block !== AIR) voxels[chunkIndex(lx, ly, lz)] = block;
      }
    }
  }

  chunk.reapplyEdits();
  chunk.refreshEmpty();
  chunk.generated = true;
}

/** Convenience: the surface height at a world column (for spawning the camera). */
export function surfaceHeightAt(
  wx: number,
  wz: number,
  params: VoxelTerrainParams,
  seed: number,
): number {
  return columnHeight(wx, wz, params, seed);
}

/** Eye-height spawn position over the terrain at the world origin column. */
export function voxelSpawn(planet: string): Vector3 {
  const params = getVoxelTerrain(planet);
  const seed = seedFromName(planet);
  return new Vector3(0.5, surfaceHeightAt(0, 0, params, seed) + 2.2, 0.5);
}

/** Player box-centre spawn: feet just above the surface voxel top, small drop. */
export function voxelSpawnCenter(planet: string): Vector3 {
  const params = getVoxelTerrain(planet);
  const seed = seedFromName(planet);
  const top = surfaceHeightAt(0, 0, params, seed) + 1; // surface voxel top
  return new Vector3(0.5, top + 0.9 + 0.4, 0.5); // + half-height + settle gap
}

// Procedural per-chunk generation. Runs on the main thread (cheap CPU noise),
// fills the chunk's bit-packed Uint32Array, then reapplies persisted edits.
// Block layering, seas, dunes, craters, glowing-ice veins and lava lakes are
// chosen by the body's archetype; colours come from the per-body palette.

import { Vector3 } from 'three';
import { CHUNK_SIZE, chunkIndex, packVoxel, BLOCK } from './voxelTypes';
import { fbm2, valueNoise3, valueNoise2, cellHash, seedFromName } from './noise';
import type { Chunk } from './chunk';
import { getVoxelTerrain, type VoxelTerrainParams } from './voxelBiomes';
import type { LandmarkSpec, POISpec } from './contentProfiles';
import { generatePOI, POI_MAX_HALF_EXTENT } from './structures';

/** Crater bowl + rim height delta (regolith bodies). */
function craterDelta(wx: number, wz: number, seed: number, strength: number): number {
  const CELL = 30;
  const gx = Math.floor(wx / CELL);
  const gz = Math.floor(wz / CELL);
  let best = Infinity;
  let bestR = 1;
  for (let oz = -1; oz <= 1; oz++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = gx + ox;
      const cz = gz + oz;
      if (cellHash(cx, cz, seed + 31) > 0.55) continue; // only some cells have craters
      const px = (cx + cellHash(cx, cz, seed + 1)) * CELL;
      const pz = (cz + cellHash(cx, cz, seed + 2)) * CELL;
      const radius = CELL * (0.22 + cellHash(cx, cz, seed + 3) * 0.3);
      const d = Math.hypot(wx - px, wz - pz);
      if (d / radius < best / bestR) {
        best = d;
        bestR = radius;
      }
    }
  }
  if (best === Infinity) return 0;
  const t = best / bestR;
  if (t > 1.3) return 0;
  const bowl = t < 1 ? 1 - t * t : 0; // 1 at centre → 0 at edge
  const rim = Math.exp(-(((t - 1) / 0.22) ** 2)); // bump at the rim
  return strength * (-bowl * bestR * 0.4 + rim * bestR * 0.16);
}

/** Height delta (voxels) from a single named landmark at world (wx, wz). Each
 *  landmark is a deterministic analytic shape anchored at its world position —
 *  the same approach as craterDelta, but one large hand-placed feature. */
function landmarkDelta(wx: number, wz: number, lm: LandmarkSpec): number {
  const dx = wx - lm.position[0];
  const dz = wz - lm.position[1];
  switch (lm.kind) {
    case 'volcano': {
      const t = Math.hypot(dx, dz) / lm.radius;
      if (t >= 1) return 0;
      const cone = Math.pow(1 - t, 1.6) * lm.amplitude;
      // Summit caldera: a dip carved into the peak.
      const caldera = t < 0.14 ? -(1 - t / 0.14) * lm.amplitude * 0.22 : 0;
      return cone + caldera;
    }
    case 'basin':
    case 'lake': {
      const t = Math.hypot(dx, dz) / lm.radius;
      if (t >= 1) return 0;
      // Flat floor inside 0.7r, ramping back up to the rim — a shallow bowl.
      const f = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      return -lm.amplitude * f;
    }
    case 'crater': {
      const t = Math.hypot(dx, dz) / lm.radius;
      if (t > 1.3) return 0;
      const bowl = t < 1 ? 1 - t * t : 0;
      const rim = Math.exp(-(((t - 1) / 0.2) ** 2));
      return -bowl * lm.amplitude + rim * lm.amplitude * 0.3;
    }
    case 'canyon':
    case 'ridge': {
      const a = ((lm.angleDeg ?? 0) * Math.PI) / 180;
      const ux = Math.cos(a);
      const uz = Math.sin(a);
      const along = dx * ux + dz * uz;
      const half = (lm.length ?? lm.radius * 2) / 2;
      const perp = Math.abs(-dx * uz + dz * ux);
      if (Math.abs(along) > half || perp > lm.radius) return 0;
      const t = perp / lm.radius;
      const taper = 1 - Math.pow(Math.abs(along) / half, 4); // ease out at the ends
      return lm.kind === 'canyon'
        ? -lm.amplitude * (1 - t * t) * taper // trench
        : lm.amplitude * (1 - t) * taper; // wall
    }
    default:
      return 0;
  }
}

/** Surface height (voxels) of the column at world (wx, wz). */
function columnHeight(wx: number, wz: number, p: VoxelTerrainParams, seed: number): number {
  const roll = (fbm2(wx * p.rollFreq, wz * p.rollFreq, seed, p.octaves) * 2 - 1) * p.rollAmp;
  const mRaw = fbm2(wx * p.mountainFreq, wz * p.mountainFreq, seed + 7919, p.octaves);
  const mountain = (p.ridged ? 1 - Math.abs(mRaw * 2 - 1) : mRaw) * p.mountainAmp;
  let h = p.baseHeight + roll + mountain;
  if (p.duneAmp > 0) {
    const warp = valueNoise2(wx * 0.012, wz * 0.012, seed + 51) * 6.28;
    h += p.duneAmp * Math.sin(wx * 0.22 + wz * 0.08 + warp);
  }
  if (p.craters > 0) h += craterDelta(wx, wz, seed, p.craters);
  for (let i = 0; i < p.landmarks.length; i++) h += landmarkDelta(wx, wz, p.landmarks[i]);
  return Math.floor(h);
}

/** Pick the solid block for a voxel below the surface. */
function layerBlock(
  arche: VoxelTerrainParams['archetype'],
  depth: number,
  wx: number,
  wy: number,
  wz: number,
  p: VoxelTerrainParams,
  seed: number,
): number {
  switch (arche) {
    case 'earth':
      if (depth <= 0) return BLOCK.GRASS;
      if (depth <= 3) return BLOCK.SUBSOIL;
      return BLOCK.ROCK;
    case 'dune':
      if (depth <= 2) return BLOCK.SAND;
      return BLOCK.ROCK;
    case 'ice': {
      if (depth <= 1) return BLOCK.ICE; // bright ice top
      if (
        p.glowDepth > 0 &&
        depth > p.glowDepth &&
        valueNoise3(wx * 0.12, wy * 0.12, wz * 0.12, seed + 808) > 0.78
      ) {
        return BLOCK.ICE_GLOW; // luminous veins
      }
      return depth > 22 ? BLOCK.ROCK : BLOCK.ICE;
    }
    case 'lava':
      if (depth <= 0) return BLOCK.SURFACE;
      if (depth <= 2 && valueNoise2(wx * 0.2, wz * 0.2, seed + 404) > 0.7) return BLOCK.SULPHUR;
      return BLOCK.ROCK;
    case 'regolith':
      if (depth <= 0) return BLOCK.SURFACE;
      if (depth <= 4) return BLOCK.SUBSOIL;
      return BLOCK.ROCK;
    default: // rock (dust)
      if (depth <= 0) return BLOCK.SURFACE;
      if (depth <= 4) return BLOCK.SUBSOIL;
      return BLOCK.ROCK;
  }
}

export function generateChunk(chunk: Chunk, params: VoxelTerrainParams, seed: number): void {
  const { voxels } = chunk;
  const arche = params.archetype;
  const baseX = chunk.cx * CHUNK_SIZE;
  const baseY = chunk.cy * CHUNK_SIZE;
  const baseZ = chunk.cz * CHUNK_SIZE;
  voxels.fill(0);

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    const wx = baseX + lx;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wz = baseZ + lz;
      const h = columnHeight(wx, wz, params, seed);
      const topFill = Math.max(params.waterLevel, params.lavaLevel, h);
      if (baseY > topFill) continue; // wholly above terrain and any liquid

      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        const wy = baseY + ly;
        let block: number = BLOCK.AIR;

        if (wy > h) {
          // Above the solid surface: fill liquids in the lowlands.
          if (arche === 'earth' && wy <= params.waterLevel) block = BLOCK.WATER;
          else if (arche === 'lava' && wy <= params.lavaLevel) block = BLOCK.LAVA;
        } else if (wy <= 0) {
          block = BLOCK.ROCK; // solid floor
        } else {
          const depth = h - wy;
          const carve =
            depth > 2 &&
            valueNoise3(wx * params.caveFreq, wy * params.caveFreq, wz * params.caveFreq, seed + 4201) >
              params.caveThreshold;
          if (carve) {
            // Lava archetypes flood deep caverns instead of leaving air.
            block = arche === 'lava' && wy <= params.lavaLevel ? BLOCK.LAVA : BLOCK.AIR;
          } else {
            block = layerBlock(arche, depth, wx, wy, wz, params, seed);
          }
        }

        if (block !== BLOCK.AIR) voxels[chunkIndex(lx, ly, lz)] = packVoxel(block);
      }
    }
  }

  stampPOIs(chunk, params, seed);

  chunk.reapplyEdits();
  chunk.refreshEmpty();
  chunk.generated = true;
}

/** Stamp any modular POIs whose footprint overlaps this chunk. POIs are placed
 *  deterministically on a per-spec grid; each is generated once (cached) and the
 *  voxels falling inside this chunk are written over the terrain. Generation-time
 *  stamping means POIs mesh and collide for free. */
function stampPOIs(chunk: Chunk, params: VoxelTerrainParams, seed: number): void {
  if (params.pois.length === 0) return;
  const { voxels } = chunk;
  const baseX = chunk.cx * CHUNK_SIZE;
  const baseY = chunk.cy * CHUNK_SIZE;
  const baseZ = chunk.cz * CHUNK_SIZE;
  const E = POI_MAX_HALF_EXTENT;

  for (const spec of params.pois) {
    const cell = spec.cell;
    const sSeed = seed + (seedFromName(spec.id) % 100000);
    const gx0 = Math.floor((baseX - E) / cell);
    const gx1 = Math.floor((baseX + CHUNK_SIZE + E) / cell);
    const gz0 = Math.floor((baseZ - E) / cell);
    const gz1 = Math.floor((baseZ + CHUNK_SIZE + E) / cell);
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        if (cellHash(gx, gz, sSeed + 17) > spec.density) continue;
        const ax = Math.round((gx + cellHash(gx, gz, sSeed + 1)) * cell);
        const az = Math.round((gz + cellHash(gx, gz, sSeed + 2)) * cell);
        const pSeed = Math.floor(cellHash(gx, gz, sSeed + 3) * 1e9);
        const built = generatePOI(spec.type, pSeed, params.archetype);
        const ox = ax - (built.footprint[0] >> 1);
        const oz = az - (built.footprint[1] >> 1);
        const oy = columnHeight(ax, az, params, seed); // floor sits on the surface
        for (const v of built.voxels) {
          const lx = ox + v.x - baseX;
          const ly = oy + v.y - baseY;
          const lz = oz + v.z - baseZ;
          if (lx < 0 || lx >= CHUNK_SIZE || ly < 0 || ly >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE)
            continue;
          voxels[chunkIndex(lx, ly, lz)] = packVoxel(v.block);
        }
      }
    }
  }
}

/** Solid-land height at a world column (excludes sea/lava fill) — for placing
 *  surface scatter on real ground and skipping liquid. */
export function landHeightAt(
  wx: number,
  wz: number,
  params: VoxelTerrainParams,
  seed: number,
): number {
  return columnHeight(wx, wz, params, seed);
}

/** Surface height at a world column (for spawning). */
export function surfaceHeightAt(
  wx: number,
  wz: number,
  params: VoxelTerrainParams,
  seed: number,
): number {
  // Spawn above any sea/lava surface too, so the player never starts submerged.
  return Math.max(columnHeight(wx, wz, params, seed), params.waterLevel, params.lavaLevel);
}

export interface NearbyPOI {
  spec: POISpec;
  ax: number;
  az: number;
  dist: number;
}

/** Nearest POI anchor to (px, pz) within maxDist, or null. Reverses the same
 *  deterministic placement the stamper uses, so the discovery scan and the
 *  rendered ruin always agree. No spatial index needed — the cell grid is the
 *  index. */
export function findNearbyPOI(
  params: VoxelTerrainParams,
  seed: number,
  px: number,
  pz: number,
  maxDist: number,
): NearbyPOI | null {
  let best: NearbyPOI | null = null;
  for (const spec of params.pois) {
    const cell = spec.cell;
    const sSeed = seed + (seedFromName(spec.id) % 100000);
    const gx0 = Math.floor((px - maxDist) / cell);
    const gx1 = Math.floor((px + maxDist) / cell);
    const gz0 = Math.floor((pz - maxDist) / cell);
    const gz1 = Math.floor((pz + maxDist) / cell);
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        if (cellHash(gx, gz, sSeed + 17) > spec.density) continue;
        const ax = Math.round((gx + cellHash(gx, gz, sSeed + 1)) * cell);
        const az = Math.round((gz + cellHash(gx, gz, sSeed + 2)) * cell);
        const dist = Math.hypot(px - ax, pz - az);
        if (dist <= maxDist && (best === null || dist < best.dist)) best = { spec, ax, az, dist };
      }
    }
  }
  return best;
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

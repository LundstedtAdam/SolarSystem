// Maps the shared Phase 8 BiomeProfile onto voxel-world parameters. Each body
// picks one of six archetypes (geometry + geology + block roles); its colours
// still come from its own BiomeProfile, so two bodies sharing an archetype look
// distinct. This is variation layers 1–3: same systems, per-body data.

import { getBiome } from '../terrain/biomes';
import { BLOCK, BLOCK_COUNT, PALETTE_STRIDE } from './voxelTypes';
import { getContent, type LandmarkSpec, type POISpec } from './contentProfiles';

export type Archetype = 'rock' | 'regolith' | 'earth' | 'ice' | 'lava' | 'dune';

// 16 landable bodies mapped onto 6 archetypes.
const ARCHETYPE: Record<string, Archetype> = {
  Mars: 'rock',
  'Månen': 'regolith',
  Jorden: 'earth',
  Europa: 'ice',
  Io: 'lava',
  Titan: 'dune',
  // Mapped bodies:
  Merkurius: 'regolith',
  Venus: 'lava',
  Phobos: 'regolith',
  Deimos: 'regolith',
  Ganymede: 'ice',
  Callisto: 'ice',
  Miranda: 'rock',
  Triton: 'ice',
  Pluto: 'ice',
  Charon: 'regolith',
};

export function archetypeFor(planet: string): Archetype {
  return ARCHETYPE[planet] ?? 'rock';
}

export interface VoxelTerrainParams {
  archetype: Archetype;
  baseHeight: number;
  rollAmp: number;
  rollFreq: number;
  mountainAmp: number;
  mountainFreq: number;
  ridged: boolean;
  octaves: number;
  caveFreq: number;
  caveThreshold: number;
  /** Impact-crater intensity 0..1 (regolith). */
  craters: number;
  /** Sea level in voxels for earth seas, or -1 (none). */
  waterLevel: number;
  /** Dune ripple amplitude (dune), or 0. */
  duneAmp: number;
  /** Voxels below the surface where glowing-ice veins appear (ice), or 0. */
  glowDepth: number;
  /** Lava-lake level in voxels (lava), or -1. */
  lavaLevel: number;
  /** Named procedural landmarks carved into the height field (Phase 10.1). */
  landmarks: LandmarkSpec[];
  /** Modular ruined points-of-interest stamped into chunks (Phase 10.2). */
  pois: POISpec[];
}

function rgb(pal: Float32Array, id: number, r: number, g: number, b: number, emissive = 0) {
  const o = id * PALETTE_STRIDE;
  pal[o] = r;
  pal[o + 1] = g;
  pal[o + 2] = b;
  pal[o + 3] = emissive;
}

/** RGBA palette (rgb + emissive) per block id, coloured from the body's biome. */
export function getVoxelPalette(planet: string): Float32Array {
  const b = getBiome(planet);
  const pal = new Float32Array(BLOCK_COUNT * PALETTE_STRIDE);

  // Generic layers from the biome elevation palette.
  rgb(pal, BLOCK.SURFACE, ...(b.colorMid as [number, number, number]));
  rgb(pal, BLOCK.SUBSOIL, ...(b.colorLow as [number, number, number]));
  rgb(pal, BLOCK.ROCK, b.colorLow[0] * 0.55, b.colorLow[1] * 0.55, b.colorLow[2] * 0.55);

  // Archetype-specific materials.
  rgb(pal, BLOCK.GRASS, b.colorMid[0] * 0.75, b.colorMid[1], b.colorMid[2] * 0.5);
  rgb(pal, BLOCK.SAND, ...(b.colorMid as [number, number, number]));
  rgb(pal, BLOCK.WATER, 0.08, 0.26, 0.5);
  rgb(pal, BLOCK.ICE, ...(b.colorHigh as [number, number, number]));
  // Glowing ice: blue-shifted toward the biome, self-lit.
  rgb(
    pal,
    BLOCK.ICE_GLOW,
    b.colorMid[0] * 0.4 + 0.15,
    b.colorMid[1] * 0.5 + 0.35,
    b.colorMid[2] * 0.5 + 0.55,
    0.7,
  );
  rgb(pal, BLOCK.LAVA, 1.0, 0.42, 0.08, 1.0);
  rgb(pal, BLOCK.SULPHUR, 0.85, 0.72, 0.16);
  // Built materials for ruined POIs (Phase 10.2): weathered metal, panelling,
  // and faintly self-lit glazing so domes/windows read against dim skies.
  rgb(pal, BLOCK.METAL, 0.5, 0.52, 0.55);
  rgb(pal, BLOCK.PANEL, 0.34, 0.36, 0.4);
  rgb(pal, BLOCK.GLASS, 0.55, 0.7, 0.78, 0.12);
  return pal;
}

export function getVoxelTerrain(planet: string): VoxelTerrainParams {
  const b = getBiome(planet);
  const arche = archetypeFor(planet);
  const relief = b.continentAmp + b.mountainAmp;

  const p: VoxelTerrainParams = {
    archetype: arche,
    baseHeight: 40,
    rollAmp: Math.min(6 + relief * 0.35, 26),
    rollFreq: 1 / 80,
    mountainAmp: Math.min(b.mountainAmp * 0.8, 22),
    mountainFreq: 1 / 36,
    ridged: b.mountainAmp >= 12,
    octaves: Math.max(3, b.octaves),
    caveFreq: 0.07,
    caveThreshold: 0.8,
    craters: 0,
    waterLevel: -1,
    duneAmp: 0,
    glowDepth: 0,
    lavaLevel: -1,
    landmarks: getContent(planet).landmarks,
    pois: getContent(planet).pois,
  };

  switch (arche) {
    case 'earth':
      p.waterLevel = p.baseHeight; // seas fill the lowlands
      break;
    case 'regolith':
      p.craters = Math.max(b.craterStrength, 0.55);
      break;
    case 'dune':
      p.duneAmp = 3.5;
      p.caveThreshold = 0.85; // fewer caves in dunes
      break;
    case 'ice':
      p.glowDepth = 7;
      p.caveThreshold = 0.72; // larger ice caverns
      break;
    case 'lava':
      p.lavaLevel = p.baseHeight - 9; // lava lakes in the lowlands
      p.caveThreshold = 0.78;
      break;
    default:
      break; // 'rock'
  }
  return p;
}

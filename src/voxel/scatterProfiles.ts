// Per-body surface scatter (variation layer 3). One InstancedMesh of props per
// body, placed deterministically on the terrain: dead rocks on the Moon, sulphur
// crystals on Io, ice spires on Europa, fungal blooms on Titan, scattered rocks
// on Mars/Earth. Same ground, very different feel. Colours come from the biome.

import { getBiome } from '../terrain/biomes';
import { archetypeFor } from './voxelBiomes';
import { lifeAmbiguous } from './contentProfiles';

export type ScatterKind = 'rock' | 'crystal' | 'spire' | 'fungus' | 'slab' | 'blade' | 'branch';

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
  /** Only place within a couple voxels of the body's water/lake surface —
   *  shoreline/wetland dressing (reeds, wet-ground clumps). Unused (undefined)
   *  everywhere else. */
  waterAdjacent?: boolean;
  /** Only place where an ore vein surfaces within a few voxels of the ground
   *  (queried directly against oreAt() by the caller) — a visual hint at
   *  what's below without a HUD marker. */
  oreTell?: boolean;
  /** Thin out toward the flat-world "poles" (see LATITUDE_SPAN in
   *  voxelBiomes.ts) — living ground cover getting sparser away from the
   *  equator, a gradual biome transition rather than a uniform carpet. */
  latitudeFalloff?: boolean;
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

/** Fine loose stones/grit every body gets — much smaller and denser than the
 *  feature scatter layer above, so the ground itself reads as textured
 *  underfoot instead of smooth voxel faces between the occasional feature
 *  prop. Reuses the existing 'rock' geometry at a tiny scale. */
function abioticGrit(planet: string): ScatterProfile {
  const b = getBiome(planet);
  return {
    kind: 'rock',
    color: [b.colorLow[0] * 0.8, b.colorLow[1] * 0.8, b.colorLow[2] * 0.8],
    emissive: [0, 0, 0],
    emissiveIntensity: 0,
    density: 0.5,
    cell: 3,
    minScale: 0.12,
    maxScale: 0.3,
    scaleXYZ: [1, 0.6, 1],
    yFactor: 0.3,
  };
}

/** A rare glinting mineral fleck, only placed where an ore vein actually
 *  surfaces within a few voxels (VoxelScatter.tsx checks oreTell against
 *  oreAt() directly) — a visual hint at what's below without a HUD marker.
 *  Universal (every archetype has ore veins via resourceProfiles.ts's
 *  FUNDAMENTALS), so this is unconditional like abioticGrit above. */
function oreGlint(): ScatterProfile {
  return {
    kind: 'crystal',
    color: [0.75, 0.72, 0.6],
    emissive: [0.3, 0.28, 0.15],
    emissiveIntensity: 0.2,
    density: 0.05,
    cell: 6,
    minScale: 0.15,
    maxScale: 0.3,
    scaleXYZ: [1, 1, 1],
    yFactor: 0.3,
    oreTell: true,
  };
}

/** Earth's grass tufts — dense, cheap crossed-quad billboards. Thins toward
 *  the poles (latitudeFalloff) — a gradual biome transition rather than a
 *  uniform green carpet end to end. */
function earthGrass(): ScatterProfile {
  return {
    kind: 'blade',
    color: [0.2, 0.55, 0.18],
    emissive: [0, 0, 0],
    emissiveIntensity: 0,
    density: 0.55,
    cell: 2,
    minScale: 0.6,
    maxScale: 1.1,
    scaleXYZ: [1, 1, 1],
    yFactor: 0,
    latitudeFalloff: true,
  };
}

/** Earth's small wildflowers/mushroom caps — sparse, colourful bloom accents
 *  among the grass. Reuses the 'fungus' dome geometry at a much smaller
 *  scale than Titan's alien blooms. Same polar thinning as the grass. */
function earthFlora(): ScatterProfile {
  return {
    kind: 'fungus',
    color: [0.85, 0.6, 0.25],
    emissive: [0, 0, 0],
    emissiveIntensity: 0,
    density: 0.05,
    cell: 5,
    minScale: 0.25,
    maxScale: 0.45,
    scaleXYZ: [1, 0.8, 1],
    yFactor: 0.3,
    latitudeFalloff: true,
  };
}

/** Deliberately ambiguous flora-like growths for bodies whose science note
 *  leaves the life question open (see lifeAmbiguous() above) — sparse and
 *  small so they read as "could be biological, could be mineral," never as a
 *  confirmed ecosystem. Tinted from the body's own high-elevation colour so
 *  each world's growths look like they belong there, not a recoloured
 *  copy-paste of Earth's. */
function ambiguousGrowth(planet: string): ScatterProfile {
  const b = getBiome(planet);
  return {
    kind: 'fungus',
    color: [b.colorHigh[0] * 0.7 + 0.1, b.colorHigh[1] * 0.6 + 0.05, b.colorHigh[2] * 0.7 + 0.15],
    emissive: [b.colorHigh[0] * 0.2, b.colorHigh[1] * 0.15, b.colorHigh[2] * 0.25],
    emissiveIntensity: 0.15,
    density: 0.04,
    cell: 9,
    minScale: 0.3,
    maxScale: 0.6,
    scaleXYZ: [1, 0.7, 1],
    yFactor: 0.3,
  };
}

/** Wet, dark mineral dressing along any shoreline (World Richness Phase 6) —
 *  abiotic, so every body gets this regardless of life status; the
 *  waterAdjacent filter (VoxelScatter.tsx) means it silently places nothing
 *  on a body with no water/lake at all, at negligible cost. Reuses 'rock'. */
function shorelineMinerals(planet: string): ScatterProfile {
  const b = getBiome(planet);
  return {
    kind: 'rock',
    color: [b.colorLow[0] * 0.5, b.colorLow[1] * 0.5, b.colorLow[2] * 0.55],
    emissive: [0, 0, 0],
    emissiveIntensity: 0,
    density: 0.3,
    cell: 3,
    minScale: 0.15,
    maxScale: 0.35,
    scaleXYZ: [1, 0.5, 1],
    yFactor: 0.25,
    waterAdjacent: true,
  };
}

/** Earth-only reeds along the shoreline — real plant matter, so (unlike
 *  shorelineMinerals) this is not offered on ambiguous-life bodies: "reeds"
 *  reads as a much stronger, less deniable life claim than the deliberately
 *  vague growths used elsewhere. */
function shorelineReeds(): ScatterProfile {
  return {
    kind: 'blade',
    color: [0.28, 0.4, 0.2],
    emissive: [0, 0, 0],
    emissiveIntensity: 0,
    density: 0.35,
    cell: 3,
    minScale: 0.7,
    maxScale: 1.3,
    scaleXYZ: [1, 1.4, 1],
    yFactor: 0,
    waterAdjacent: true,
    latitudeFalloff: true,
  };
}

/** Ground-level clutter layers for a body: always includes fine abiotic
 *  grit, a universal ore-tell fleck, and shoreline mineral dressing;
 *  additionally includes flora-like accents on Earth (real biology,
 *  unconditional, plus reeds) or bodies whose life question is still open
 *  (deliberately ambiguous — see lifeAmbiguous()). Every other body stays
 *  abiotic-only, by design, per the game's existing no-confirmed-life
 *  narrative rule. */
export function getGroundClutter(planet: string): ScatterProfile[] {
  const layers: ScatterProfile[] = [abioticGrit(planet), oreGlint(), shorelineMinerals(planet)];
  if (archetypeFor(planet) === 'earth') {
    layers.push(earthGrass(), earthFlora(), shorelineReeds());
  } else if (lifeAmbiguous(planet)) {
    layers.push(ambiguousGrowth(planet));
  }
  return layers;
}

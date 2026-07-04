// Per-body surface scatter (variation layer 3). One InstancedMesh of props per
// body, placed deterministically on the terrain: dead rocks on the Moon, sulphur
// crystals on Io, ice spires on Europa, fungal blooms on Titan, scattered rocks
// on Mars/Earth. Same ground, very different feel. Colours come from the biome.

import { getBiome } from '../terrain/biomes';
import { archetypeFor } from './voxelBiomes';
import { getContent } from './contentProfiles';

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
}

/** True if this body's own science note leaves the life question open
 *  ('theoretical' or 'inconclusive') rather than settled ('not_detected') —
 *  the gate for sparse, deliberately-ambiguous flora-like ground clutter on
 *  alien worlds. Reads the same source of truth narrative content already
 *  uses (contentProfiles.ts), so this can never drift from the game's actual
 *  science-integrity data. Earth is handled separately (unconditional real
 *  biology) and never needs this check. */
function lifeAmbiguous(planet: string): boolean {
  return getContent(planet).scienceNotes.some(
    (n) => n.lifeStatus === 'theoretical' || n.lifeStatus === 'inconclusive',
  );
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

/** Earth's grass tufts — dense, cheap crossed-quad billboards. */
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
  };
}

/** Earth's small wildflowers/mushroom caps — sparse, colourful bloom accents
 *  among the grass. Reuses the 'fungus' dome geometry at a much smaller
 *  scale than Titan's alien blooms. */
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

/** Ground-level clutter layers for a body: always includes fine abiotic
 *  grit; additionally includes flora-like accents on Earth (real biology,
 *  unconditional) or bodies whose life question is still open (deliberately
 *  ambiguous — see lifeAmbiguous()). Every other body stays abiotic-only, by
 *  design, per the game's existing no-confirmed-life narrative rule. */
export function getGroundClutter(planet: string): ScatterProfile[] {
  const layers: ScatterProfile[] = [abioticGrit(planet), oreGlint()];
  if (archetypeFor(planet) === 'earth') {
    layers.push(earthGrass(), earthFlora());
  } else if (lifeAmbiguous(planet)) {
    layers.push(ambiguousGrowth(planet));
  }
  return layers;
}

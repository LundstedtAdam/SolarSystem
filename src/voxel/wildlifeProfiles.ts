// World Richness Phase 8 — ambient wildlife. Same narrative gate as ground
// clutter (Phase 2) and trees (Phase 7): real fauna only on Earth, sparse
// deliberately ambiguous drifting shapes only on bodies whose life question
// is still open (lifeAmbiguous in contentProfiles.ts), nothing anywhere
// else. Motion is simple procedural circling/bobbing (no skeletal rig),
// consistent with the "GPU-friendly rendering" requirement.

import { getBiome } from '../terrain/biomes';
import { archetypeFor } from './voxelBiomes';
import { lifeAmbiguous } from './contentProfiles';

export type CreatureKind = 'bird' | 'critter' | 'drifter';

export interface CreatureSpecies {
  kind: CreatureKind;
  color: [number, number, number];
  emissive: [number, number, number];
  emissiveIntensity: number;
  size: number;
  /** Height above ground the anchor sits at (birds circle up high). */
  hoverHeight: number;
  /** Horizontal circling radius around the anchor (voxels). */
  radius: number;
  /** Angular speed around the anchor (rad/s). */
  speed: number;
  /** Vertical bob amplitude/speed layered on top of the circling motion. */
  bobAmp: number;
  bobSpeed: number;
}

export interface WildlifeProfile {
  species: CreatureSpecies;
  /** Probability a spawn cell holds a creature. */
  density: number;
  /** Placement cell size (voxels). */
  cell: number;
}

function earthBirds(): WildlifeProfile {
  return {
    species: {
      kind: 'bird',
      color: [0.15, 0.14, 0.16],
      emissive: [0, 0, 0],
      emissiveIntensity: 0,
      size: 0.35,
      hoverHeight: 7,
      radius: 3.5,
      speed: 0.8,
      bobAmp: 0.4,
      bobSpeed: 1.3,
    },
    density: 0.1,
    cell: 14,
  };
}

function earthCritters(): WildlifeProfile {
  return {
    species: {
      kind: 'critter',
      color: [0.35, 0.28, 0.16],
      emissive: [0, 0, 0],
      emissiveIntensity: 0,
      size: 0.22,
      hoverHeight: 0.15,
      radius: 1.2,
      speed: 1.4,
      bobAmp: 0.12,
      bobSpeed: 4,
    },
    density: 0.12,
    cell: 8,
  };
}

/** Sparse, deliberately ambiguous drifting shapes — never a clear animal
 *  silhouette, matching the ground-clutter/tree growths' visual language on
 *  the same bodies. Tinted from the body's own high-elevation colour. */
function ambiguousDrifters(planet: string): WildlifeProfile {
  const b = getBiome(planet);
  return {
    species: {
      kind: 'drifter',
      color: [b.colorHigh[0] * 0.6 + 0.15, b.colorHigh[1] * 0.55 + 0.15, b.colorHigh[2] * 0.65 + 0.2],
      emissive: [b.colorHigh[0] * 0.3, b.colorHigh[1] * 0.25, b.colorHigh[2] * 0.35],
      emissiveIntensity: 0.35,
      size: 0.28,
      hoverHeight: 1.5,
      radius: 1.8,
      speed: 0.25,
      bobAmp: 0.3,
      bobSpeed: 0.5,
    },
    density: 0.03,
    cell: 20,
  };
}

/** Wildlife profiles for a body: real fauna on Earth, one sparse ambiguous
 *  layer on bodies whose life question is still open, none anywhere else. */
export function getWildlife(planet: string): WildlifeProfile[] {
  if (archetypeFor(planet) === 'earth') return [earthBirds(), earthCritters()];
  if (lifeAmbiguous(planet)) return [ambiguousDrifters(planet)];
  return [];
}

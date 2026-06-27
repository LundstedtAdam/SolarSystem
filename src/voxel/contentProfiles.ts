// Phase 10 — per-body CONTENT spine. Mirrors the existing per-body lookup
// pattern (getBiome / getScatter / getWeather / getSurfaceAudio): a single table
// keyed by canonical (Swedish) body names returns the authored content for that
// world. Phase 10.0 consumes only `props`; `landmarks`, `pois` and `emitters`
// are defined here so later sub-phases (10.1–10.4) extend the same table without
// reshaping callers. Bodies with no entry fall back to an empty-safe default,
// and the prop layer falls back to the archetype scatter, so nothing regresses.

import type { ScatterProfile } from './scatterProfiles';

/** A surface scatter prop. Same shape as the archetype ScatterProfile, but
 *  authored explicitly per body so a world can mix several distinct, science-
 *  grounded prop types (e.g. Mars ventifacts + sedimentary outcrops + ice). */
export type PropSpec = ScatterProfile;

/** A large procedural geological landmark, carved into the height field at a
 *  body-relative anchor (consumed in Phase 10.1). */
export interface LandmarkSpec {
  name: string;
  kind: 'volcano' | 'canyon' | 'basin' | 'ridge' | 'crater' | 'lake';
  /** World anchor (voxel coords) relative to the disembark origin. */
  position: [number, number];
  /** Approximate footprint radius in voxels. */
  radius: number;
  /** Peak/trench amplitude in voxels (sign by kind). */
  amplitude: number;
  description?: string;
}

/** A modular ruined point-of-interest, assembled + damaged from voxel templates
 *  and scannable for its layered story (consumed in Phase 10.2 / 10.4). */
export interface POISpec {
  id: string;
  name: string;
  /** Placement cell size (voxels); cellHash decides which cells hold one. */
  cell: number;
  density: number;
  /** Layered narrative-stratigraphy text revealed on scan. */
  story?: { base: string; disruption: string; human: string };
}

/** A world-anchored particle emitter (dust devil, fumarole, geyser, bubbles…)
 *  distinct from the camera-box weather system (consumed in Phase 10.3). */
export interface EmitterSpec {
  kind: 'dust_devil' | 'fumarole' | 'geyser' | 'methane_bubble' | 'vacuum_dust';
  /** Probability per emitter cell; emitters are placed deterministically. */
  density: number;
  cell: number;
}

export interface ContentProfile {
  /** Surface scatter props. Empty → fall back to the archetype scatter. */
  props: PropSpec[];
  landmarks: LandmarkSpec[];
  pois: POISpec[];
  emitters: EmitterSpec[];
}

const EMPTY: ContentProfile = { props: [], landmarks: [], pois: [], emitters: [] };

// --- Authored content -------------------------------------------------------
// Mars (canonical name "Mars"): wind-sculpted ventifacts, layered sedimentary
// outcrops, and subsurface water-ice exposed by impacts — its real surface
// character. Other showcase bodies (Io, Pluto) are authored in 10.1+.
const CONTENT: Record<string, ContentProfile> = {
  Mars: {
    props: [
      {
        // Ventifacts — angular basalt fragments sculpted by abrasive dust wind.
        kind: 'rock',
        color: [0.46, 0.27, 0.18],
        emissive: [0, 0, 0],
        emissiveIntensity: 0,
        density: 0.3,
        cell: 6,
        minScale: 0.5,
        maxScale: 1.4,
        scaleXYZ: [1.1, 0.7, 0.85],
        yFactor: 0.3,
      },
      {
        // Sedimentary outcrops — flat, layered slabs of stratified rock.
        kind: 'slab',
        color: [0.52, 0.33, 0.22],
        emissive: [0, 0, 0],
        emissiveIntensity: 0,
        density: 0.16,
        cell: 9,
        minScale: 0.8,
        maxScale: 1.8,
        scaleXYZ: [1.7, 0.45, 1.2],
        yFactor: 0.45,
      },
      {
        // Subsurface water-ice exposed by impacts — rare, faintly self-lit.
        kind: 'slab',
        color: [0.78, 0.84, 0.9],
        emissive: [0.2, 0.3, 0.45],
        emissiveIntensity: 0.15,
        density: 0.06,
        cell: 12,
        minScale: 0.5,
        maxScale: 1.1,
        scaleXYZ: [1.0, 0.5, 1.0],
        yFactor: 0.4,
      },
    ],
    landmarks: [],
    pois: [],
    emitters: [],
  },
};

export function getContent(planet: string): ContentProfile {
  return CONTENT[planet] ?? EMPTY;
}

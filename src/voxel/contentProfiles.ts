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
  /** Radial footprint radius, or half-width for linear features (voxels). */
  radius: number;
  /** Peak/trench amplitude in voxels (magnitude; sign is applied by kind). */
  amplitude: number;
  /** Linear features (canyon/ridge): full length along the axis (voxels). */
  length?: number;
  /** Linear features: axis orientation in degrees (0 = +X). */
  angleDeg?: number;
  description?: string;
}

/** Structural archetype of a POI; selects the module pool + materials. */
export type POIType = 'processor' | 'dome' | 'geothermal' | 'relay';

/** A modular ruined point-of-interest, assembled + damaged from voxel templates
 *  and scannable for its layered story (consumed in Phase 10.2 / 10.4). */
export interface POISpec {
  id: string;
  name: string;
  /** Structural archetype (module pool + built materials). */
  type: POIType;
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
    landmarks: [
      {
        name: 'Olympus Mons',
        kind: 'volcano',
        position: [620, 620],
        radius: 380,
        amplitude: 130, // towering shield volcano with a summit caldera
        description: "The Solar System's largest volcano.",
      },
      {
        name: 'Valles Marineris',
        kind: 'canyon',
        position: [-220, 40],
        radius: 65, // half-width
        amplitude: 52, // trench depth
        length: 1300,
        angleDeg: 18,
        description: 'A canyon system thousands of kilometres long.',
      },
    ],
    pois: [
      {
        id: 'mars_processor',
        name: 'Atmospheric processor',
        type: 'processor',
        cell: 110,
        density: 0.4,
        story: {
          base: 'An atmospheric processor — one of hundreds meant to thicken the Martian air over centuries.',
          disruption: 'A dust storm choked its intakes; the reactor scrammed and never restarted.',
          human: 'Tools were left mid-repair. Whoever was here expected to come back.',
        },
      },
      {
        id: 'mars_dome',
        name: 'Botanical dome',
        type: 'dome',
        cell: 150,
        density: 0.32,
        story: {
          base: 'A pressurised botanical dome, growing the first crops under glass.',
          disruption: 'The glazing cracked; the pressure bled out and the cold took everything.',
          human: 'Red dust has drifted over the planting beds. Nothing green remains.',
        },
      },
    ],
    emitters: [{ kind: 'dust_devil', density: 0.12, cell: 40 }],
  },

  Io: {
    props: [], // archetype scatter (sulphur crystals) until 10.5
    landmarks: [
      {
        name: 'Loki Patera',
        kind: 'lake',
        position: [430, 300],
        radius: 200,
        amplitude: 26, // depression depth; the lava level floods it into a lake
        description: 'A vast, restless lava lake.',
      },
    ],
    pois: [
      {
        id: 'io_geothermal',
        name: 'Geothermal tap',
        type: 'geothermal',
        cell: 100,
        density: 0.45,
        story: {
          base: 'A geothermal tap drawing power from Io’s endless volcanism.',
          disruption: 'A resurfacing event buried the vents; the blast doors fused shut in the heat.',
          human: 'The maintenance logs still blink in warning amber, talking to no one.',
        },
      },
    ],
    emitters: [{ kind: 'fumarole', density: 0.18, cell: 24 }],
  },

  Pluto: {
    props: [],
    landmarks: [
      {
        name: 'Sputnik Planitia',
        kind: 'basin',
        position: [0, 560],
        radius: 520,
        amplitude: 20, // broad, shallow nitrogen-ice plain
        description: 'A vast plain of frozen nitrogen.',
      },
      {
        name: 'Wright Mons',
        kind: 'volcano',
        position: [-430, 220],
        radius: 220,
        amplitude: 64, // suspected cryovolcano
        description: 'A possible ice volcano.',
      },
    ],
    pois: [
      {
        id: 'pluto_relay',
        name: 'Interstellar launch relay',
        type: 'relay',
        cell: 130,
        density: 0.4,
        story: {
          base: 'A launch relay — the last waypoint for probes leaving the Solar System.',
          disruption: 'The advancing nitrogen glacier reached its foundations and never stopped.',
          human: 'Half the antenna array is already entombed in creeping ice.',
        },
      },
    ],
    emitters: [],
  },

  Triton: {
    props: [],
    landmarks: [],
    pois: [],
    emitters: [{ kind: 'geyser', density: 0.1, cell: 50 }], // nitrogen cryo-plumes
  },

  Titan: {
    props: [],
    landmarks: [],
    pois: [],
    emitters: [{ kind: 'methane_bubble', density: 0.3, cell: 14 }],
  },

  // Airless Moon: dust kicked up by the player's footsteps falls in a perfect
  // parabolic arc (vacuum). Player-anchored, so density/cell are unused.
  'Månen': {
    props: [],
    landmarks: [],
    pois: [],
    emitters: [{ kind: 'vacuum_dust', density: 0, cell: 0 }],
  },
};

export function getContent(planet: string): ContentProfile {
  return CONTENT[planet] ?? EMPTY;
}

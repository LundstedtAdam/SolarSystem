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
  /** A cross-body mystery clue revealed on scan. */
  clue?: string;
  /** Mystery this clue belongs to; clues sharing an id converge to a resolution. */
  mysteryId?: string;
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
        clue: 'A maintenance terminal still logs a faint signal from below — and a bearing.',
        mysteryId: 'signal',
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
        clue: 'Buried in the logs: the same signal, the same bearing as somewhere far colder.',
        mysteryId: 'signal',
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
        clue: 'The dish is still locked onto one bearing — the third that matches the others.',
        mysteryId: 'signal',
      },
    ],
    emitters: [],
  },

  Triton: {
    props: [],
    landmarks: [
      { name: 'Cantaloupe Terrain', kind: 'basin', position: [0, 480], radius: 440, amplitude: 12, description: 'Dimpled, melon-rind terrain unique to Triton.' },
    ],
    pois: [
      {
        id: 'triton_listening',
        name: 'Listening post',
        type: 'relay',
        cell: 130,
        density: 0.4,
        story: {
          base: 'A deep-space listening post on the system’s frozen edge.',
          disruption: 'A new cryovolcanic vent opened directly beneath it.',
          human: 'Nitrogen frost has sealed the door from the outside.',
        },
        clue: 'Its last recording is a bearing — matching one logged far sunward.',
        mysteryId: 'signal',
      },
    ],
    emitters: [{ kind: 'geyser', density: 0.1, cell: 50 }], // nitrogen cryo-plumes
  },

  Titan: {
    props: [],
    landmarks: [
      { name: 'Kraken Mare', kind: 'lake', position: [0, 520], radius: 480, amplitude: 16, description: 'Titan’s largest methane sea.' },
    ],
    pois: [
      {
        id: 'titan_aerostat',
        name: 'Aerostat wreck',
        type: 'relay',
        cell: 140,
        density: 0.38,
        story: {
          base: 'A half-submerged aerostat that once drifted Titan’s thick skies.',
          disruption: 'Its condensers clogged with tholin dust and it came down.',
          human: 'The hull bears an Earth manufacturer’s mark — from no recorded mission.',
        },
        clue: 'Serial plate: built on Earth, for a flight that officially never happened.',
        mysteryId: 'manufacturer',
      },
    ],
    emitters: [{ kind: 'methane_bubble', density: 0.3, cell: 14 }],
  },

  // Airless Moon: dust kicked up by the player's footsteps falls in a perfect
  // parabolic arc (vacuum). Player-anchored, so density/cell are unused.
  'Månen': {
    props: [
      // Pristine impact ejecta — no wind to round it.
      { kind: 'rock', color: [0.62, 0.62, 0.64], emissive: [0, 0, 0], emissiveIntensity: 0, density: 0.4, cell: 6, minScale: 0.5, maxScale: 1.6, scaleXYZ: [1, 0.85, 1], yFactor: 0.3 },
      // Glassy impact spherules — tiny, faintly bright.
      { kind: 'slab', color: [0.8, 0.8, 0.85], emissive: [0.1, 0.1, 0.12], emissiveIntensity: 0.1, density: 0.08, cell: 10, minScale: 0.3, maxScale: 0.6, scaleXYZ: [1, 0.6, 1], yFactor: 0.4 },
    ],
    landmarks: [
      { name: 'Tycho', kind: 'crater', position: [400, 360], radius: 240, amplitude: 30, description: 'A young crater with brilliant rays.' },
    ],
    pois: [
      {
        id: 'moon_dome',
        name: 'Heritage dome',
        type: 'dome',
        cell: 120,
        density: 0.38,
        story: {
          base: 'A protective dome raised over an Apollo-era landing site.',
          disruption: 'A micrometeorite swarm punched the dome through in seconds.',
          human: 'The flag inside still stands, under a ceiling of holes.',
        },
      },
    ],
    emitters: [{ kind: 'vacuum_dust', density: 0, cell: 0 }],
  },

  Merkurius: {
    props: [
      // Angular fractured basalt — no wind or water to smooth it.
      { kind: 'rock', color: [0.45, 0.43, 0.42], emissive: [0, 0, 0], emissiveIntensity: 0, density: 0.34, cell: 6, minScale: 0.5, maxScale: 1.5, scaleXYZ: [1.2, 0.6, 0.9], yFactor: 0.3 },
      // Bright blue-tinted hollow rims.
      { kind: 'slab', color: [0.7, 0.74, 0.82], emissive: [0.05, 0.07, 0.12], emissiveIntensity: 0.12, density: 0.07, cell: 11, minScale: 0.6, maxScale: 1.2, scaleXYZ: [1.5, 0.4, 1.5], yFactor: 0.4 },
    ],
    landmarks: [
      { name: 'Caloris Basin', kind: 'basin', position: [0, 560], radius: 520, amplitude: 26, description: 'One of the largest impact basins in the Solar System.' },
    ],
    pois: [
      {
        id: 'mercury_solar',
        name: 'Solar-harvesting array',
        type: 'processor',
        cell: 120,
        density: 0.4,
        story: {
          base: 'A subterranean array harvesting the ferocious sunlight from below the surface.',
          disruption: 'Thermal expansion sheared the support trusses in a single hot dawn.',
          human: 'Everything points one way — toward the exit. They ran.',
        },
      },
    ],
    emitters: [],
  },

  Venus: {
    props: [],
    landmarks: [
      { name: 'Maxwell Montes', kind: 'ridge', position: [-300, 250], radius: 80, amplitude: 70, length: 900, angleDeg: 35, description: 'Venus’s highest mountains.' },
    ],
    pois: [
      {
        id: 'venus_habitat',
        name: 'Atmospheric habitat wreck',
        type: 'dome',
        cell: 130,
        density: 0.36,
        story: {
          base: 'A cloud-borne habitat brought down into the tesserae highlands.',
          disruption: 'Pressure and acid did in hours what the descent began.',
          human: 'A crushed probe lies beside it — Venera-class, centuries older.',
        },
      },
    ],
    emitters: [],
  },

  Jorden: {
    props: [],
    landmarks: [
      { name: 'Elevator Anchor', kind: 'ridge', position: [0, 400], radius: 50, amplitude: 60, length: 200, angleDeg: 0, description: 'The ruined ground anchor of a space elevator.' },
    ],
    pois: [
      {
        id: 'earth_transit',
        name: 'Flooded transit hub',
        type: 'processor',
        cell: 120,
        density: 0.42,
        story: {
          base: 'A municipal transit hub beneath a drowned city.',
          disruption: 'The seas came up the stairwells and never went back down.',
          human: 'An automated broadcast still loops, calling trains that will never run.',
        },
      },
    ],
    emitters: [],
  },

  Phobos: {
    props: [],
    landmarks: [
      { name: 'Stickney', kind: 'crater', position: [0, 300], radius: 220, amplitude: 24, description: 'The great crater that nearly shattered Phobos.' },
    ],
    pois: [
      {
        id: 'phobos_tether',
        name: 'Orbital tether station',
        type: 'relay',
        cell: 110,
        density: 0.4,
        story: {
          base: 'The ground station of an orbital tether to Mars.',
          disruption: 'The tether snapped; its cables lie tangled in the grooves.',
          human: 'Someone spray-marked a countdown on the wall. It reached zero.',
        },
        clue: 'A scrawled bearing on the console — the same heading, again.',
        mysteryId: 'signal',
      },
    ],
    emitters: [],
  },

  Deimos: {
    props: [],
    landmarks: [],
    pois: [
      {
        id: 'deimos_cache',
        name: 'Buried cache',
        type: 'processor',
        cell: 90,
        density: 0.5,
        story: {
          base: 'A smuggler’s cache, hidden under thick regolith.',
          disruption: 'The dust did the hiding; nobody ever came back to dig it up.',
          human: 'Pry it open and the manifests make no sense at all.',
        },
      },
    ],
    emitters: [],
  },

  Europa: {
    props: [
      // Jagged ice pinnacles.
      { kind: 'spire', color: [0.82, 0.9, 1.0], emissive: [0.25, 0.45, 0.9], emissiveIntensity: 0.4, density: 0.42, cell: 6, minScale: 0.8, maxScale: 2.6, scaleXYZ: [0.45, 1.2, 0.45], yFactor: 0.6 },
      // Pressure-ridge ice blocks.
      { kind: 'slab', color: [0.7, 0.8, 0.92], emissive: [0.1, 0.2, 0.4], emissiveIntensity: 0.18, density: 0.14, cell: 9, minScale: 0.7, maxScale: 1.6, scaleXYZ: [1.5, 0.6, 1.0], yFactor: 0.45 },
    ],
    landmarks: [
      { name: 'Conamara Chaos', kind: 'basin', position: [0, 460], radius: 420, amplitude: 14, description: 'A jumble of ice rafts over a buried ocean.' },
    ],
    pois: [
      {
        id: 'europa_drill',
        name: 'Sub-ice drilling platform',
        type: 'geothermal',
        cell: 120,
        density: 0.4,
        story: {
          base: 'A platform drilling toward the ocean beneath the ice.',
          disruption: 'The ice shifted and swallowed the shaft whole.',
          human: 'Two submersibles hang frozen in the wall where the crack closed.',
        },
      },
    ],
    emitters: [],
  },

  Ganymede: {
    props: [],
    landmarks: [
      { name: 'Galileo Regio', kind: 'basin', position: [0, 500], radius: 460, amplitude: 12, description: 'An ancient dark-terrain province.' },
    ],
    pois: [
      {
        id: 'ganymede_magnetics',
        name: 'Magnetic field station',
        type: 'relay',
        cell: 120,
        density: 0.4,
        story: {
          base: 'A station studying Ganymede’s own magnetic field.',
          disruption: 'Shifting ice grooves tore the building cleanly in half.',
          human: 'The two halves drifted apart, instruments still reaching for each other.',
        },
        clue: 'A half-corrupted log repeats one bearing before the data ends.',
        mysteryId: 'signal',
      },
    ],
    emitters: [],
  },

  Callisto: {
    props: [],
    landmarks: [
      { name: 'Valhalla', kind: 'crater', position: [0, 520], radius: 500, amplitude: 18, description: 'A vast multi-ring impact structure.' },
    ],
    pois: [
      {
        id: 'callisto_cryo',
        name: 'Cryogenic facility',
        type: 'dome',
        cell: 130,
        density: 0.36,
        story: {
          base: 'A fully operational cryogenic sleep facility.',
          disruption: 'Nothing went wrong here. No breach, no fire, no fault.',
          human: 'Every sleep pod is open, powered, and empty. Just absence.',
        },
      },
    ],
    emitters: [],
  },

  Miranda: {
    props: [],
    landmarks: [
      { name: 'Verona Rupes', kind: 'ridge', position: [-260, 0], radius: 70, amplitude: 80, length: 700, angleDeg: 90, description: 'The tallest known cliff in the Solar System.' },
    ],
    pois: [
      {
        id: 'miranda_outpost',
        name: 'Cliffside outpost',
        type: 'processor',
        cell: 120,
        density: 0.38,
        story: {
          base: 'A research outpost perched on the lip of Verona Rupes.',
          disruption: 'The ledge gave way; most of the outpost went over the edge.',
          human: 'A black box still pings, twenty kilometres straight down.',
        },
      },
    ],
    emitters: [],
  },

  Charon: {
    props: [],
    landmarks: [
      { name: 'Serenity Chasma', kind: 'canyon', position: [0, 200], radius: 70, amplitude: 60, length: 1100, angleDeg: 8, description: 'A rift canyon that splits Charon’s face.' },
    ],
    pois: [
      {
        id: 'charon_facility',
        name: 'Seismic facility',
        type: 'processor',
        cell: 120,
        density: 0.38,
        story: {
          base: 'A facility probing Charon’s interior with seismic charges.',
          disruption: 'Its own testing triggered the landslide that crushed it.',
          human: 'The last log entry is an argument about whether to fire again.',
        },
      },
    ],
    emitters: [],
  },
};

export function getContent(planet: string): ContentProfile {
  return CONTENT[planet] ?? EMPTY;
}

// Phase 10 — per-body CONTENT spine. Mirrors the existing per-body lookup
// pattern (getBiome / getScatter / getWeather / getSurfaceAudio): a single table
// keyed by canonical (Swedish) body names returns the authored content for that
// world. Phase 10.0 consumes only `props`; `landmarks`, `pois` and `emitters`
// are defined here so later sub-phases (10.1–10.4) extend the same table without
// reshaping callers. Bodies with no entry fall back to an empty-safe default,
// and the prop layer falls back to the archetype scatter, so nothing regresses.

import type { ScatterProfile } from './scatterProfiles';
import { assertNoLifeClaim } from './contentValidation';

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
  /** Phase 10.5 — Mystery & Narrative System: which of the 8 war-lore acts
   *  this POI belongs to. A wholly distinct thread from `story`/`clue` above;
   *  a POI never carries both. See WAR_LORE_ACTS for the act's scanner text. */
  act?: number;
  /** Minimum Xenolinguistic Decoder tier required before the scan reads as
   *  `WAR_LORE_ACTS[act].trueMeaning` instead of `.corruptedText`. Always 2 for
   *  now (only two tiers exist), kept as data rather than a hardcoded literal
   *  so a future tier 3+ language family doesn't need a schema change. */
  translationTierRequired?: number;
}

/** A discoverable Translation Fragment (Phase 10.5): found in the world like a
 *  POI (same deterministic cell-hash placement), never crafted or purchased.
 *  Collecting one raises the player's global translation tier once enough are
 *  found — see TRANSLATION_FRAGMENT_THRESHOLD in store.ts. */
export interface TranslationFragmentSpec {
  id: string;
  name: string;
  /** Which act this fragment is found within (flavor/placement only). */
  act: number;
  cell: number;
  density: number;
  /** Shown once, at the moment of discovery. */
  flavorText: string;
}

/** A world-anchored particle emitter (dust devil, fumarole, geyser, bubbles…)
 *  distinct from the camera-box weather system (consumed in Phase 10.3). */
export interface EmitterSpec {
  kind: 'dust_devil' | 'fumarole' | 'geyser' | 'methane_bubble' | 'vacuum_dust';
  /** Probability per emitter cell; emitters are placed deterministically. */
  density: number;
  cell: number;
}

// --- Two-layer biome/life content (post-Phase-11) --------------------------
// Layer 1 ("science notes"): cautious, real-world-grounded scanner text on
// every landable body. `lifeStatus` has no 'confirmed' member — a content
// author cannot claim confirmed extraterrestrial life here even by mistake;
// it's a compile error, not a convention. See contentValidation.ts for the
// secondary free-text guard.
export type LifeStatus = 'not_detected' | 'theoretical' | 'inconclusive';

export interface ScienceNoteSpec {
  id: string;
  name: string;
  /** Always false — literal type, cannot be omitted or flipped to true. This
   *  is what structurally separates Layer 1 from Layer 2 in the data itself. */
  readonly speculative: false;
  lifeStatus: LifeStatus;
  /** 'needs-citation-review' flags a claim that hasn't been independently
   *  verified — surfaced by a dev-only content audit, never shown in-game. */
  confidence: 'established' | 'needs-citation-review';
  text: { headline: string; detail: string };
  /** Same deterministic cell-hash placement model as POISpec. */
  cell: number;
  density: number;
}

// Layer 2 ("deep sites"): explicit, deliberate FICTION — hidden hand-placed
// chambers on exactly 5 bodies, reachable only by digging/descending through
// real overburden. Confirmed-within-the-fiction language is intentional and
// expected here; `speculative: true` is what makes that safe.
export interface DeepDiscoverySpec {
  id: string;
  name: string;
  readonly speculative: true;
  /** true = an actual (fictional) lifeform; false = inanimate/pre-biotic. */
  isLife: boolean;
  /** Fixed (x, z) world-voxel anchor — deterministic, not procedural. */
  position: [number, number];
  /** Voxels below the surface column where the chamber begins/ends. */
  depthMin: number;
  depthMax: number;
  radius: number;
  story: { base: string; disruption?: string; human: string };
}

export interface ContentProfile {
  /** Surface scatter props. Empty → fall back to the archetype scatter. */
  props: PropSpec[];
  landmarks: LandmarkSpec[];
  pois: POISpec[];
  emitters: EmitterSpec[];
  /** Layer 1 — real-science scanner notes (every body). */
  scienceNotes: ScienceNoteSpec[];
  /** Layer 2 — fictional deep discoveries (Europa/Titan/Mars/Pluto/Moon only). */
  deepSites: DeepDiscoverySpec[];
  /** Phase 10.5 — discoverable Translation Fragments (war-lore thread only). */
  translationFragments: TranslationFragmentSpec[];
}

const EMPTY: ContentProfile = {
  props: [],
  landmarks: [],
  pois: [],
  emitters: [],
  scienceNotes: [],
  deepSites: [],
  translationFragments: [],
};

// --- Phase 10.5 — Mystery & Narrative System --------------------------------
// The 8-act Junta/Coalition/Exodus war story. Entirely separate from the Layer
// 1/2 astrobiology content above: war-lore POIs carry `act` + no `story`, and
// are read through the Xenolinguistic Decoder (store.ts translationTier)
// rather than shown directly. Text below is verbatim from the approved story
// bible — do not paraphrase when wiring it into per-body POIs.
export interface WarLoreAct {
  act: number;
  location: string;
  poiTypeLabel: string;
  corruptedText: string;
  trueMeaning: string;
}

export const WAR_LORE_ACTS: Record<number, WarLoreAct> = {
  1: {
    act: 1,
    location: 'Earth & Moon',
    poiTypeLabel: 'Deep Crater Excavation',
    corruptedText: 'Analyzing alloy... Origin: Human. Age: ~200,000 years. Purpose: Unknown.',
    trueMeaning:
      "Remnants of the Exodus faction's initial landing craft before they destroyed their technology.",
  },
  2: {
    act: 2,
    location: 'Mars',
    poiTypeLabel: 'Vitrified City Ruins',
    corruptedText:
      'Structural analysis: Organic harmony architecture shattered by extreme, exogenous thermal bombardment.',
    trueMeaning:
      'The Junta built brutalist military structures over the original peaceful architecture, and the ' +
      'Coalition burned it all during the final strike.',
  },
  3: {
    act: 3,
    location: 'Phobos & Deimos',
    poiTypeLabel: 'Orbital Defense Platforms',
    corruptedText:
      'Defensive grid offline. Massive incoming fire detected from outer system. Holding the line.',
    trueMeaning:
      "These were not defensive grids; they were the Junta's primary staging grounds for galactic invasion.",
  },
  4: {
    act: 4,
    location: 'Jupiter System',
    poiTypeLabel: 'Alien Wreckage & Bio-Anomalies',
    corruptedText:
      'Warning: Non-human biological signatures detected. Hull configurations optimized for chaotic ' +
      'assault. Extreme threat.',
    trueMeaning:
      "These are Coalition terraforming and science vessels, desperately retrofitted with weapons to " +
      "survive the Junta's slaughter.",
  },
  5: {
    act: 5,
    location: 'Saturn (Titan)',
    poiTypeLabel: 'Frozen Command Center',
    corruptedText:
      '[Partial Translation] ...Alliance formed... Target: Sol System... Total containment required...',
    trueMeaning:
      'The logs are expressions of grief. The Coalition allied solely to contain the Junta, mourning the ' +
      'loss of their former human mentors.',
  },
  6: {
    act: 6,
    location: 'Uranus (Miranda)',
    poiTypeLabel: 'Spacetime Fracture Zone',
    corruptedText:
      'Extreme sub-space anomalies detected. Planetary crust shattered by localized spacetime inversion weapon.',
    trueMeaning:
      'The sheer force of the Quarantine weapon tearing spacetime to lock the Solar System away from the ' +
      'galaxy.',
  },
  7: {
    act: 7,
    location: 'Neptune (Triton)',
    poiTypeLabel: 'Quarantine Lock Generator',
    corruptedText:
      "[Translation Matrix Restored] 'Our guides have gone mad... The Junta slaughters our worlds... We " +
      "must lock them away to save the galaxy. Forgive us, humans.'",
    trueMeaning:
      'Humanity was the aggressor. The Quarantine is a pacifist measure to stop a genocide without ' +
      'committing one.',
  },
  8: {
    act: 8,
    location: 'Pluto & Charon',
    poiTypeLabel: 'Hidden Exodus Cache',
    corruptedText:
      "Log: 'We flee to the blue world. We leave our tech behind so the Junta cannot find us. We will " +
      "preserve the soul of humanity in the dirt.' FTL drive schematics unlocked.",
    trueMeaning:
      'The player is not the heir of the Junta, but of the peaceful resistance. Breaking the quarantine ' +
      '(FTL) is an act of reconciliation, not war.',
  },
};

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
        id: 'mars_vitrified_ruins',
        name: 'Vitrified City Ruins',
        type: 'processor',
        cell: 180,
        density: 0.06,
        act: 2,
        translationTierRequired: 2,
      },
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
    scienceNotes: [
      {
        id: 'mars_regolith',
        name: 'Regolith scan',
        speculative: false,
        lifeStatus: 'theoretical',
        confidence: 'established',
        text: {
          headline: 'Iron-oxide regolith, seasonal dust transport.',
          detail:
            'The rust-red surface is iron oxide dust. Confirmed subsurface and polar water ice make Mars ' +
            'a long-standing focus of astrobiology, but no organism, past or present, has been detected. ' +
            'Any biosignature here remains an open research question.',
        },
        cell: 100,
        density: 0.5,
      },
    ],
    deepSites: [
      {
        id: 'mars_lava_tube',
        name: 'Sealed lava tube',
        speculative: true,
        isLife: true,
        position: [180, -260],
        depthMin: 22,
        depthMax: 40,
        radius: 14,
        story: {
          base:
            'A collapsed lava tube, sealed by a dust fall long after the flow cooled. The air inside is ' +
            'dead still.',
          disruption:
            'Frost rimes a cluster of dormant, extremophile-like organisms clinging to the tube wall — ' +
            'inert, but not dead. A thermal source might change that.',
          human:
            'This is fiction, not a real discovery: no confirmed life exists on Mars. In-story, a focused ' +
            'thermal tool could reactivate whatever this is. Nobody has tried yet.',
        },
      },
    ],
    translationFragments: [
      {
        id: 'fragment_act2',
        name: 'Translation Fragment — Vitrified Script',
        act: 2,
        cell: 200,
        density: 0.03,
        flavorText:
          'A shard of glazed tile, its surface etched with a script that partially resolves against the ' +
          'decoder’s existing language model. Xenolinguistic Decoder: language family expanded.',
      },
    ],
  },

  Io: {
    props: [
      {
        // Raw sulfur-dioxide frost crust, freshly deposited near a vent.
        kind: 'crystal', color: [0.9, 0.85, 0.6], emissive: [0.6, 0.3, 0.05], emissiveIntensity: 0.25,
        density: 0.09, cell: 9, minScale: 0.4, maxScale: 1.0, scaleXYZ: [0.7, 0.7, 0.7], yFactor: 0.35,
      },
    ],
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
      // Phase 10.5 — Act 4 (Jupiter System): rewritten from the original
      // standalone geothermal-tap ruin to carry the war-lore thread. Layer 1
      // scienceNotes below is untouched and coexists as a separate discovery.
      {
        id: 'io_bio_anomaly',
        name: 'Bio-Anomaly Cluster',
        type: 'geothermal',
        cell: 180,
        density: 0.06,
        act: 4,
        translationTierRequired: 2,
      },
    ],
    emitters: [{ kind: 'fumarole', density: 0.18, cell: 24 }],
    scienceNotes: [
      {
        id: 'io_volcanism',
        name: 'Volcanic survey',
        speculative: false,
        lifeStatus: 'not_detected',
        confidence: 'established',
        text: {
          headline: "The Solar System's most volcanically active body.",
          detail:
            'Io is wracked by intense tidal heating from Jupiter, driving hundreds of active volcanoes ' +
            'and constant resurfacing. Surface temperatures, radiation, and sulfur chemistry make it one ' +
            'of the least hospitable bodies known — no habitability interest here.',
        },
        cell: 100,
        density: 0.45,
      },
    ],
    deepSites: [],
    translationFragments: [],
  },

  Pluto: {
    props: [
      {
        // Nitrogen-ice polygon terrain, Sputnik-Planitia-style convection cells.
        kind: 'slab', color: [0.85, 0.78, 0.74], emissive: [0.1, 0.08, 0.12], emissiveIntensity: 0.1,
        density: 0.1, cell: 13, minScale: 0.9, maxScale: 1.8, scaleXYZ: [1.6, 0.3, 1.4], yFactor: 0.3,
      },
    ],
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
        id: 'pluto_exodus_cache',
        name: 'Hidden Exodus Cache',
        type: 'dome',
        cell: 180,
        density: 0.06,
        act: 8,
        translationTierRequired: 2,
      },
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
    scienceNotes: [
      {
        id: 'pluto_ices',
        name: 'Ice-plain composition',
        speculative: false,
        lifeStatus: 'not_detected',
        confidence: 'established',
        text: {
          headline: 'A nitrogen-ice surface over a suspected subsurface ocean.',
          detail:
            'Sputnik Planitia is a vast plain of nitrogen, methane, and carbon-monoxide ice. Evidence ' +
            'suggests a liquid water layer deep beneath the crust, but at these temperatures and this ' +
            'depth there is no evidence of biological activity.',
        },
        cell: 110,
        density: 0.4,
      },
    ],
    deepSites: [
      {
        id: 'pluto_crystal_chamber',
        name: 'Crystalline chamber',
        speculative: true,
        isLife: false,
        position: [-120, 340],
        depthMin: 12,
        depthMax: 26,
        radius: 12,
        story: {
          base:
            'A cavity beneath the nitrogen ice, its walls lined with geometrically regular crystal growth ' +
            '— too ordered to be a simple freeze pattern.',
          disruption:
            'The formations branch and repeat with an almost deliberate symmetry. They do not move, ' +
            'react, or show any sign of metabolism.',
          human:
            'This is fiction: explicitly not life, not even in-story. It reads as unusually organized ' +
            'pre-biotic chemistry — chemistry on the road to something, that never got there.',
        },
      },
    ],
    translationFragments: [],
  },

  Triton: {
    props: [
      {
        // Nitrogen-geyser deposit spires with dark wind-streaked dust trails.
        kind: 'spire', color: [0.55, 0.48, 0.46], emissive: [0, 0, 0], emissiveIntensity: 0,
        density: 0.07, cell: 11, minScale: 0.6, maxScale: 1.5, scaleXYZ: [0.5, 1.2, 0.5], yFactor: 0.5,
      },
    ],
    landmarks: [
      { name: 'Cantaloupe Terrain', kind: 'basin', position: [0, 480], radius: 440, amplitude: 12, description: 'Dimpled, melon-rind terrain unique to Triton.' },
    ],
    pois: [
      {
        id: 'triton_lock_generator',
        name: 'Quarantine Lock Generator',
        type: 'relay',
        cell: 180,
        density: 0.06,
        act: 7,
        translationTierRequired: 2,
      },
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
    scienceNotes: [
      {
        id: 'triton_cryovolcanism',
        name: 'Cryovolcanic survey',
        speculative: false,
        lifeStatus: 'not_detected',
        confidence: 'established',
        text: {
          headline: 'Active nitrogen-gas geysers, a retrograde captured orbit.',
          detail:
            "Triton's dimpled cantaloupe terrain and observed geyser plumes suggest ongoing surface " +
            'activity for a body this cold. Its retrograde orbit suggests it is a captured Kuiper Belt ' +
            'object rather than a native Neptunian moon. No biological indicators found.',
        },
        cell: 110,
        density: 0.4,
      },
    ],
    deepSites: [],
    translationFragments: [],
  },

  Titan: {
    props: [
      {
        // Evaporite terraces along dry methane-lake shorelines.
        kind: 'slab', color: [0.42, 0.28, 0.1], emissive: [0.15, 0.08, 0.02], emissiveIntensity: 0.1,
        density: 0.09, cell: 12, minScale: 0.7, maxScale: 1.6, scaleXYZ: [1.5, 0.35, 1.2], yFactor: 0.35,
      },
    ],
    landmarks: [
      { name: 'Kraken Mare', kind: 'lake', position: [0, 520], radius: 480, amplitude: 16, description: 'Titan’s largest methane sea.' },
    ],
    pois: [
      {
        id: 'titan_command_center',
        name: 'Frozen Command Center',
        type: 'processor',
        cell: 180,
        density: 0.06,
        act: 5,
        translationTierRequired: 2,
      },
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
    scienceNotes: [
      {
        id: 'titan_methane_cycle',
        name: 'Hydrocarbon-lake survey',
        speculative: false,
        lifeStatus: 'theoretical',
        confidence: 'established',
        text: {
          headline: 'A methane/ethane hydrological cycle, a thick nitrogen atmosphere.',
          detail:
            'Titan is the only body besides Earth known to have stable liquid on its surface — lakes and ' +
            'seas of liquid methane and ethane. Its rich organic chemistry has made it a serious target ' +
            'for astrobiology research, but this refers to prebiotic chemistry, not detected life.',
        },
        cell: 110,
        density: 0.4,
      },
    ],
    deepSites: [
      {
        id: 'titan_lake_vents',
        name: 'Kraken Mare depths',
        speculative: true,
        isLife: true,
        position: [0, 460],
        depthMin: 6,
        depthMax: 16,
        radius: 16,
        story: {
          base:
            'Beneath the methane surface of Kraken Mare, the cold thickens into something closer to gel ' +
            'than liquid.',
          disruption:
            'Something moves down here — barely. Pale, membranous forms drift and contract on a timescale ' +
            'of minutes, an alien metabolism running at cryogenic speed.',
          human:
            'This is fiction: no life has been found on Titan. In-story it is deliberately non-Earth-like ' +
            '— slow, cold-adapted, built from a chemistry that would be inert anywhere warmer.',
        },
      },
    ],
    translationFragments: [],
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
        id: 'moon_crater_dig',
        name: 'Deep Crater Excavation',
        type: 'dome',
        cell: 180,
        density: 0.06,
        act: 1,
        translationTierRequired: 2,
      },
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
    scienceNotes: [
      {
        id: 'moon_regolith',
        name: 'Regolith survey',
        speculative: false,
        lifeStatus: 'not_detected',
        confidence: 'established',
        text: {
          headline: 'Airless, ancient, and geologically largely inert.',
          detail:
            'The lunar surface has been battered by impacts for billions of years with no atmosphere or ' +
            'weather to erase the record. It carries no habitability interest — no atmosphere, no liquid ' +
            'water at the surface, no known biosignature.',
        },
        cell: 100,
        density: 0.45,
      },
    ],
    deepSites: [
      {
        id: 'moon_impact_pocket',
        name: 'Anomalous impact pocket',
        speculative: true,
        isLife: false,
        position: [420, 340],
        depthMin: 4,
        depthMax: 10,
        radius: 8,
        story: {
          base:
            'A shallow pocket near Tycho, fused glass on one side, ordinary regolith on the other — the ' +
            'signature of a very old, very fast impact.',
          disruption:
            'Embedded in the glass are fossilized fragments unlike anything native to the Moon: layered, ' +
            'organic-looking structures, long since mineralized.',
          human:
            'This is fiction: a mystery object, not indigenous lunar life. In-story it plays on ' +
            'lithopanspermia — the idea that impact ejecta can carry biological material between worlds. ' +
            'Whatever it is, it did not originate here.',
        },
      },
    ],
    translationFragments: [],
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
    scienceNotes: [
      {
        id: 'mercury_extremes',
        name: 'Thermal survey',
        speculative: false,
        lifeStatus: 'not_detected',
        confidence: 'established',
        text: {
          headline: 'Extreme day/night temperature swings, permanently shadowed polar craters.',
          detail:
            "Mercury's surface swings from scorching to frigid between day and night. Permanently " +
            'shadowed polar craters are cold enough to host water ice, but the planet has no atmosphere ' +
            'and no known biosignature.',
        },
        cell: 100,
        density: 0.4,
      },
    ],
    deepSites: [],
    translationFragments: [],
  },

  Venus: {
    props: [
      {
        // Rippled, glassy pahoehoe lava-flow slabs, faintly still warm.
        kind: 'slab', color: [0.35, 0.18, 0.08], emissive: [0.3, 0.05, 0], emissiveIntensity: 0.15,
        density: 0.1, cell: 10, minScale: 0.7, maxScale: 1.6, scaleXYZ: [1.6, 0.35, 1.3], yFactor: 0.4,
      },
    ],
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
    scienceNotes: [
      {
        id: 'venus_atmosphere',
        name: 'Atmospheric survey',
        speculative: false,
        lifeStatus: 'inconclusive',
        confidence: 'needs-citation-review',
        text: {
          headline: 'A crushing, superheated, sulfuric-acid atmosphere.',
          detail:
            'Surface conditions on Venus are lethal to any known organism. Some researchers have proposed ' +
            'that the temperate cloud layer, tens of kilometres up, could theoretically support ' +
            'microbial-scale chemistry; this remains unconfirmed and contested, not a detection.',
        },
        cell: 100,
        density: 0.4,
      },
    ],
    deepSites: [],
    translationFragments: [],
  },

  Jorden: {
    props: [
      {
        // Weathered limestone outcrops breaking through the topsoil.
        kind: 'slab', color: [0.55, 0.52, 0.42], emissive: [0, 0, 0], emissiveIntensity: 0,
        density: 0.08, cell: 11, minScale: 0.6, maxScale: 1.5, scaleXYZ: [1.4, 0.5, 1.1], yFactor: 0.35,
      },
    ],
    landmarks: [
      { name: 'Elevator Anchor', kind: 'ridge', position: [0, 400], radius: 50, amplitude: 60, length: 200, angleDeg: 0, description: 'The ruined ground anchor of a space elevator.' },
    ],
    pois: [
      {
        id: 'earth_crater_dig',
        name: 'Deep Crater Excavation',
        type: 'dome',
        cell: 180,
        density: 0.06,
        act: 1,
        translationTierRequired: 2,
      },
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
    scienceNotes: [
      {
        id: 'earth_baseline',
        name: 'Biosphere baseline',
        speculative: false,
        lifeStatus: 'theoretical',
        confidence: 'established',
        text: {
          headline: 'The only confirmed life-bearing world known.',
          detail:
            "Earth remains the sole confirmed example of a life-bearing planet. Everything else in this " +
            'survey is measured against this one baseline — real or speculative, nothing found elsewhere ' +
            'has yet met the same bar of evidence.',
        },
        cell: 100,
        density: 0.4,
      },
    ],
    deepSites: [],
    translationFragments: [
      {
        id: 'fragment_act1',
        name: 'Translation Fragment — Landing Craft Log',
        act: 1,
        cell: 200,
        density: 0.03,
        flavorText:
          'A cracked data core, ~200,000 years old, its contents almost entirely unreadable. Xenolinguistic ' +
          'Decoder: language family established.',
      },
    ],
  },

  Phobos: {
    props: [
      {
        // Glassy ejecta beads from a nearby impact, faintly sheened.
        kind: 'crystal', color: [0.3, 0.3, 0.34], emissive: [0.15, 0.15, 0.2], emissiveIntensity: 0.1,
        density: 0.05, cell: 9, minScale: 0.3, maxScale: 0.7, scaleXYZ: [0.8, 0.8, 0.8], yFactor: 0.4,
      },
    ],
    landmarks: [
      { name: 'Stickney', kind: 'crater', position: [0, 300], radius: 220, amplitude: 24, description: 'The great crater that nearly shattered Phobos.' },
    ],
    pois: [
      {
        id: 'phobos_defense_platform',
        name: 'Orbital Defense Platform',
        type: 'relay',
        cell: 180,
        density: 0.06,
        act: 3,
        translationTierRequired: 2,
      },
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
    scienceNotes: [
      {
        id: 'phobos_orbit',
        name: 'Orbital decay survey',
        speculative: false,
        lifeStatus: 'not_detected',
        confidence: 'established',
        text: {
          headline: 'A captured body on a slowly decaying orbit.',
          detail:
            'Phobos is likely a captured asteroid, heavily cratered and riddled with grooves from tidal ' +
            'stress. Its orbit is decaying and it will eventually break up or impact Mars. No atmosphere, ' +
            'no biosignature.',
        },
        cell: 90,
        density: 0.4,
      },
    ],
    deepSites: [],
    translationFragments: [
      {
        id: 'fragment_act3',
        name: 'Translation Fragment — Staging Ground Manifest',
        act: 3,
        cell: 200,
        density: 0.03,
        flavorText:
          'A cargo manifest, half its glyphs still opaque. Xenolinguistic Decoder: language family ' +
          'complete — full translation online.',
      },
    ],
  },

  Deimos: {
    props: [
      {
        // Flat regolith plates, barely proud of the ankle-deep dust.
        kind: 'slab', color: [0.24, 0.22, 0.2], emissive: [0, 0, 0], emissiveIntensity: 0,
        density: 0.12, cell: 8, minScale: 0.6, maxScale: 1.3, scaleXYZ: [1.3, 0.25, 1.1], yFactor: 0.25,
      },
    ],
    landmarks: [],
    pois: [
      {
        id: 'deimos_defense_platform',
        name: 'Orbital Defense Platform',
        type: 'relay',
        cell: 180,
        density: 0.06,
        act: 3,
        translationTierRequired: 2,
      },
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
    scienceNotes: [
      {
        id: 'deimos_composition',
        name: 'Composition survey',
        speculative: false,
        lifeStatus: 'not_detected',
        confidence: 'established',
        text: {
          headline: 'A small, smooth, carbon-rich captured moonlet.',
          detail:
            'Deimos is smaller and smoother than Phobos, with a thicker regolith blanket muting its ' +
            'crater relief. Its composition resembles a carbonaceous asteroid. No atmosphere, no ' +
            'biosignature.',
        },
        cell: 90,
        density: 0.4,
      },
    ],
    deepSites: [],
    translationFragments: [],
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
      // Phase 10.5 — Act 4 (Jupiter System): rewritten from the original
      // standalone drilling-platform ruin to carry the war-lore thread. Layer
      // 1/2 content below (scienceNotes/deepSites) is untouched and coexists
      // as a separate discovery on the same body.
      {
        id: 'europa_alien_wreckage',
        name: 'Alien Wreckage Site',
        type: 'geothermal',
        cell: 180,
        density: 0.06,
        act: 4,
        translationTierRequired: 2,
      },
    ],
    emitters: [],
    scienceNotes: [
      {
        id: 'europa_ocean',
        name: 'Subsurface-ocean survey',
        speculative: false,
        lifeStatus: 'theoretical',
        confidence: 'established',
        text: {
          headline: 'An ice shell over a global liquid-water ocean.',
          detail:
            "Europa's fractured ice surface and magnetic-field signature strongly indicate a salty liquid " +
            'ocean beneath the crust, kept warm by tidal flexing. This makes it one of the leading ' +
            'astrobiology targets in the Solar System — a theoretical possibility, not a detection.',
        },
        cell: 110,
        density: 0.4,
      },
    ],
    deepSites: [
      {
        id: 'europa_vent',
        name: 'Sub-ice hydrothermal vent',
        speculative: true,
        isLife: true,
        position: [40, 300],
        depthMin: 34,
        depthMax: 58,
        radius: 18,
        story: {
          base:
            'The drill shaft breaks through the ice shell into open water — dark, pressurized, and ' +
            'shockingly warm near a vent field on the ocean floor.',
          disruption:
            'Faint bioluminescent pulses ripple across clusters of vent-dwelling organisms, feeding on ' +
            'mineral-rich plumes in total darkness.',
          human:
            'This is fiction: no life has actually been confirmed at Europa. In-story, this is exactly ' +
            'what decades of "theoretical" habitability speculation imagined finding — an entire ' +
            'ecosystem, never touched by sunlight.',
        },
      },
    ],
    translationFragments: [],
  },

  Ganymede: {
    props: [
      {
        // Fractured, dirty-ice ridges — darker and duller than Europa's shell.
        kind: 'spire', color: [0.5, 0.52, 0.58], emissive: [0.1, 0.15, 0.25], emissiveIntensity: 0.2,
        density: 0.12, cell: 9, minScale: 0.6, maxScale: 1.6, scaleXYZ: [0.6, 1.1, 0.6], yFactor: 0.5,
      },
    ],
    landmarks: [
      { name: 'Galileo Regio', kind: 'basin', position: [0, 500], radius: 460, amplitude: 12, description: 'An ancient dark-terrain province.' },
    ],
    pois: [
      // Phase 10.5 — Act 4 (Jupiter System): rewritten from the original
      // standalone magnetics-station ruin to carry the war-lore thread.
      {
        id: 'ganymede_alien_wreckage',
        name: 'Alien Wreckage Site',
        type: 'relay',
        cell: 180,
        density: 0.06,
        act: 4,
        translationTierRequired: 2,
      },
    ],
    emitters: [],
    scienceNotes: [
      {
        id: 'ganymede_magnetosphere',
        name: 'Magnetosphere survey',
        speculative: false,
        lifeStatus: 'theoretical',
        confidence: 'established',
        text: {
          headline: "The only moon known to generate its own magnetic field.",
          detail:
            "Ganymede is the Solar System's largest moon and the only one with an internally generated " +
            'magnetic field, evidence of a molten metallic core. It is also thought to hold a subsurface ' +
            'saltwater ocean, of theoretical astrobiological interest — no life has been detected.',
        },
        cell: 110,
        density: 0.4,
      },
    ],
    deepSites: [],
    translationFragments: [],
  },

  Callisto: {
    props: [
      {
        // Dark ejecta boulders scattered across the oldest surface in the system.
        kind: 'rock', color: [0.18, 0.15, 0.14], emissive: [0, 0, 0], emissiveIntensity: 0,
        density: 0.2, cell: 7, minScale: 0.5, maxScale: 1.5, scaleXYZ: [1, 0.75, 1], yFactor: 0.3,
      },
    ],
    landmarks: [
      { name: 'Valhalla', kind: 'crater', position: [0, 520], radius: 500, amplitude: 18, description: 'A vast multi-ring impact structure.' },
    ],
    pois: [
      // Phase 10.5 — Act 4 (Jupiter System): rewritten from the original
      // standalone cryogenic-facility ruin to carry the war-lore thread.
      {
        id: 'callisto_alien_wreckage',
        name: 'Alien Wreckage Site',
        type: 'dome',
        cell: 180,
        density: 0.06,
        act: 4,
        translationTierRequired: 2,
      },
    ],
    emitters: [],
    scienceNotes: [
      {
        id: 'callisto_cratering',
        name: 'Cratering survey',
        speculative: false,
        lifeStatus: 'not_detected',
        confidence: 'established',
        text: {
          headline: 'One of the most heavily cratered surfaces known.',
          detail:
            "Callisto's ancient, saturated surface has seen little geological activity since its " +
            'formation. A subsurface ocean is suspected but unconfirmed, and there is no known ' +
            'biosignature.',
        },
        cell: 110,
        density: 0.4,
      },
    ],
    deepSites: [],
    translationFragments: [],
  },

  Miranda: {
    props: [
      {
        // Giant fractured coronae fault-blocks, jumbled by resurfacing.
        kind: 'slab', color: [0.42, 0.42, 0.46], emissive: [0, 0, 0], emissiveIntensity: 0,
        density: 0.1, cell: 12, minScale: 0.8, maxScale: 2.0, scaleXYZ: [1.8, 0.6, 1.4], yFactor: 0.4,
      },
    ],
    landmarks: [
      { name: 'Verona Rupes', kind: 'ridge', position: [-260, 0], radius: 70, amplitude: 80, length: 700, angleDeg: 90, description: 'The tallest known cliff in the Solar System.' },
    ],
    pois: [
      {
        id: 'miranda_fracture_zone',
        name: 'Spacetime Fracture Zone',
        type: 'geothermal',
        cell: 180,
        density: 0.06,
        act: 6,
        translationTierRequired: 2,
      },
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
    scienceNotes: [
      {
        id: 'miranda_geology',
        name: 'Coronae survey',
        speculative: false,
        lifeStatus: 'not_detected',
        confidence: 'established',
        text: {
          headline: 'Extreme, jumbled terrain and the tallest known cliff face.',
          detail:
            "Miranda's coronae — huge, oddly patterned terrain blocks — suggest a violent geological " +
            'history, possibly partial disruption and reassembly. It is airless and has no known ' +
            'biosignature.',
        },
        cell: 110,
        density: 0.4,
      },
    ],
    deepSites: [],
    translationFragments: [],
  },

  Charon: {
    props: [
      {
        // Tholin-reddened ice-rock fragments near the dark polar cap.
        kind: 'crystal', color: [0.4, 0.32, 0.34], emissive: [0, 0, 0], emissiveIntensity: 0,
        density: 0.08, cell: 10, minScale: 0.5, maxScale: 1.2, scaleXYZ: [0.9, 0.9, 0.9], yFactor: 0.35,
      },
    ],
    landmarks: [
      { name: 'Serenity Chasma', kind: 'canyon', position: [0, 200], radius: 70, amplitude: 60, length: 1100, angleDeg: 8, description: 'A rift canyon that splits Charon’s face.' },
    ],
    pois: [
      {
        id: 'charon_exodus_cache',
        name: 'Hidden Exodus Cache',
        type: 'dome',
        cell: 180,
        density: 0.06,
        act: 8,
        translationTierRequired: 2,
      },
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
    scienceNotes: [
      {
        id: 'charon_composition',
        name: 'Composition survey',
        speculative: false,
        lifeStatus: 'not_detected',
        confidence: 'established',
        text: {
          headline: "Pluto's tidally locked, canyon-scarred companion.",
          detail:
            "Charon is roughly half Pluto's diameter and tidally locked to it. Its dark polar cap and " +
            'giant canyon system point to an ancient, possibly episodic, subsurface-ocean history. No ' +
            'atmosphere, no known biosignature.',
        },
        cell: 110,
        density: 0.4,
      },
    ],
    deepSites: [],
    translationFragments: [],
  },
};

for (const body of Object.values(CONTENT)) {
  for (const note of body.scienceNotes) assertNoLifeClaim(note);
}

export function getContent(planet: string): ContentProfile {
  return CONTENT[planet] ?? EMPTY;
}

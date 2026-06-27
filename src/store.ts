import { create } from 'zustand';
import type { Object3D } from 'three';
import { daysSinceJ2000, periodDays } from './systems/ephemeris';
import { PLANETS, isLandable, type PlanetData } from './systems/bodies';
import { detectQuality, type Quality } from './systems/quality';
import type { Lang } from './i18n';

export type SceneMode =
  | { type: 'solar' }
  | { type: 'piloting' }
  | { type: 'descending'; target: string; phase: 'orbit' | 'atmosphere' | 'landing' }
  | { type: 'surface'; planet: string }
  // Phase 9: on-foot voxel exploration, entered by disembarking on the surface.
  | { type: 'voxel'; planet: string }
  | { type: 'ascending'; planet: string };

/** Player-tunable flight control feel. */
export interface ControlConfig {
  /** Global rotation-rate multiplier (scales max turn speed). */
  sensitivity: number;
  /** Radial dead zone for the gamepad stick (0.05–0.20). */
  deadzone: number;
  /** Flip the pitch axis. */
  invertPitch: boolean;
  /** When on, the ship stabilizes and decelerates as inputs are released. */
  flightAssist: boolean;
  /** Mouse/touch look sensitivity (0.3–3.0); feeds the cubic first-person look curve. */
  mouseSensitivity: number;
  /** Fine control: caps thrust at 25% and softens rotation (held via Shift). */
  fineControl: boolean;
}

/** Layered narrative-stratigraphy text for a discovered point of interest. */
export interface DiscoveryStory {
  base: string;
  disruption: string;
  human: string;
}

/** A recorded discovery in the player's knowledge journal. */
export interface JournalEntry {
  key: string;
  planet: string;
  name: string;
  story?: DiscoveryStory;
  clue?: string;
  ts: number;
}

/** Persisted knowledge progression (Phase 10.4). Knowledge is the reward, so it
 *  survives reloads — but world voxel edits are intentionally not persisted. */
interface DiscoveryState {
  discovered: Record<string, true>;
  journal: JournalEntry[];
  mysteryClues: string[];
}

const DISCOVERY_KEY = 'solarsystem.discovery.v1';
/** Clues (of one mystery) needed before it resolves into an epiphany entry. */
const MYSTERY_THRESHOLD = 3;

/** Resolutions per mystery id. A mystery with no entry here never resolves —
 *  it lingers as an open thread (e.g. the lone Titan 'manufacturer' clue). */
const MYSTERY_RESOLUTIONS: Record<string, { name: string; story: DiscoveryStory }> = {
  signal: {
    name: 'The Signal',
    story: {
      base: 'The same buried transmission, found on three separate worlds.',
      disruption: 'Each site failed the moment it began to receive.',
      human: 'The bearings converge — they all point at the same empty place.',
    },
  },
};

function loadDiscovery(): DiscoveryState {
  const empty: DiscoveryState = { discovered: {}, journal: [], mysteryClues: [] };
  if (typeof window === 'undefined') return empty;
  try {
    const raw = window.localStorage.getItem(DISCOVERY_KEY);
    if (!raw) return empty;
    const p = JSON.parse(raw) as Partial<DiscoveryState>;
    return {
      discovered: p.discovered ?? {},
      journal: p.journal ?? [],
      mysteryClues: p.mysteryClues ?? [],
    };
  } catch {
    return empty;
  }
}

function saveDiscovery(d: DiscoveryState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DISCOVERY_KEY, JSON.stringify(d));
  } catch {
    /* storage full / unavailable — discovery just won't persist this session */
  }
}

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** Real physical data shown in the info panel for the selected body. */
export interface SelectedBody {
  name: string;
  /** Mean radius in km (diameter is derived for display). */
  radiusKm: number;
  /** Semi-major axis in AU (planets) or undefined for moons. */
  semiMajorAxisAU?: number;
  /** Orbital period in days (signed; negative = retrograde). */
  orbitalPeriodDays: number;
  /** Sidereal rotation period in days (planets only). */
  rotationPeriodDays?: number;
  axialTiltDeg?: number;
  eccentricity?: number;
  /** Surface texture URL, shown as a thumbnail. */
  thumbnail?: string;
}

/** Build the info-panel payload for a planet (shared by clicks and cycling). */
export function planetSelected(p: PlanetData): SelectedBody {
  return {
    name: p.name,
    radiusKm: p.realRadiusKm,
    semiMajorAxisAU: p.elements.aAU,
    orbitalPeriodDays: periodDays(p.elements),
    rotationPeriodDays: p.rotationPeriodDays,
    axialTiltDeg: p.axialTiltDeg,
    eccentricity: p.elements.e,
    thumbnail: p.texture,
  };
}

/**
 * Time-scale applied automatically while piloting. SimClock advances 6 sim-days
 * per real second at speed 1, so this value yields roughly real-time motion
 * (6 * 2e-6 days/s ~= 1 sec/s) — planets read as effectively stationary while
 * you fly between them, instead of streaking past. The player can still adjust
 * the speed slider manually; the pre-flight value is restored on exit.
 */
const PILOT_TIME_SCALE = 0.000002;

interface SimState {
  /** Time-scale multiplier driven by the speed slider. */
  speed: number;
  /** Speed captured when entering the ship, restored on exit (null = none saved). */
  prevSpeed: number | null;
  showOrbits: boolean;
  /** Body data for the info panel, or null when nothing is selected. */
  selected: SelectedBody | null;
  /** Live scene object the camera should frame/follow, or null. */
  focusObject: Object3D | null;
  /** Index into PLANETS of the focused planet, or null (none / a moon). */
  focusIndex: number | null;
  /** Bumped whenever the user asks to reset the camera. */
  resetCounter: number;
  /** Simulation time in days since the J2000 epoch. */
  simTimeDays: number;
  paused: boolean;
  tourActive: boolean;
  /** Master audio volume 0..1 and mute. */
  volume: number;
  muted: boolean;
  /** UI / accessibility. */
  language: Lang;
  showLabels: boolean;
  reducedMotion: boolean;
  settingsOpen: boolean;
  quality: Quality;
  /** Live meshes of planets, keyed by name, for programmatic focus. */
  planetObjects: Record<string, Object3D>;

  /** Phase 8: current scene mode (solar viewer, piloting, descent, surface). */
  sceneMode: SceneMode;
  /** Ship world position in render-space units. */
  shipPosition: [number, number, number];
  /** Ship velocity in render-space units/s. */
  shipVelocity: [number, number, number];
  /** Ship orientation as a quaternion [x, y, z, w]. */
  shipRotation: [number, number, number, number];
  /** Ship throttle 0..1. */
  shipThrottle: number;
  /** Player-tunable flight control feel. */
  controls: ControlConfig;

  /** Knowledge journal: discovered POIs keyed by `${planet}:${id}`. */
  discovered: Record<string, true>;
  journal: JournalEntry[];
  mysteryClues: string[];

  setSpeed: (speed: number) => void;
  toggleOrbits: () => void;
  select: (body: SelectedBody, object: Object3D) => void;
  reset: () => void;
  advanceTime: (deltaDays: number) => void;
  togglePause: () => void;
  registerPlanet: (name: string, object: Object3D) => void;
  focusPlanetByIndex: (index: number) => void;
  cycleFocus: (dir: 1 | -1) => void;
  toggleTour: () => void;
  setVolume: (v: number) => void;
  toggleMuted: () => void;
  setLanguage: (lang: Lang) => void;
  toggleLabels: () => void;
  setReducedMotion: (v: boolean) => void;
  toggleSettings: () => void;
  setDate: (date: Date) => void;
  setQuality: (q: Quality) => void;
  enterShip: () => void;
  exitShip: () => void;
  beginDescent: (target: string) => boolean;
  setDescentPhase: (phase: 'orbit' | 'atmosphere' | 'landing') => void;
  completeLanding: (planet: string) => void;
  disembark: () => void;
  boardShip: () => void;
  beginAscent: () => void;
  completeAscent: () => void;
  abortDescent: () => void;
  setShipPosition: (pos: [number, number, number]) => void;
  setShipVelocity: (vel: [number, number, number]) => void;
  setShipRotation: (rot: [number, number, number, number]) => void;
  setShipThrottle: (t: number) => void;
  setControls: (partial: Partial<ControlConfig>) => void;
  /** Record a scanned POI into the journal; returns true if newly discovered.
   *  Collecting MYSTERY_THRESHOLD clues resolves the cross-body signal. */
  recordDiscovery: (e: {
    planet: string;
    id: string;
    name: string;
    story?: DiscoveryStory;
    clue?: string;
    mysteryId?: string;
  }) => boolean;
}

export const useStore = create<SimState>((set, get) => ({
  speed: 1,
  prevSpeed: null,
  showOrbits: true,
  selected: null,
  focusObject: null,
  focusIndex: null,
  resetCounter: 0,
  simTimeDays: daysSinceJ2000(new Date()),
  paused: false,
  tourActive: false,
  volume: 0.6,
  muted: false,
  language: 'en',
  showLabels: true,
  reducedMotion: prefersReducedMotion,
  settingsOpen: false,
  quality: detectQuality(),
  planetObjects: {},

  sceneMode: { type: 'solar' },
  shipPosition: [0, 50, 500],
  shipVelocity: [0, 0, 0],
  shipRotation: [0, 0, 0, 1],
  shipThrottle: 0,
  controls: {
    sensitivity: 1,
    deadzone: 0.1,
    invertPitch: false,
    flightAssist: true,
    mouseSensitivity: 1.5,
    fineControl: false,
  },

  ...loadDiscovery(),

  setSpeed: (speed) => set({ speed }),
  toggleOrbits: () => set((s) => ({ showOrbits: !s.showOrbits })),
  select: (body, object) =>
    set(() => {
      const idx = PLANETS.findIndex((p) => p.name === body.name);
      return { selected: body, focusObject: object, focusIndex: idx >= 0 ? idx : null, tourActive: false };
    }),
  reset: () =>
    set((s) => ({
      selected: null,
      focusObject: null,
      focusIndex: null,
      tourActive: false,
      resetCounter: s.resetCounter + 1,
    })),
  advanceTime: (deltaDays) => set((s) => ({ simTimeDays: s.simTimeDays + deltaDays })),
  togglePause: () => set((s) => ({ paused: !s.paused })),
  registerPlanet: (name, object) =>
    set((s) => ({ planetObjects: { ...s.planetObjects, [name]: object } })),
  focusPlanetByIndex: (index) =>
    set((s) => {
      const p = PLANETS[index];
      const obj = p && s.planetObjects[p.name];
      if (!obj) return {};
      return { focusObject: obj, selected: planetSelected(p), focusIndex: index };
    }),
  cycleFocus: (dir) => {
    const s = get();
    const n = PLANETS.length;
    const next = s.focusIndex == null ? (dir > 0 ? 0 : n - 1) : (s.focusIndex + dir + n) % n;
    s.focusPlanetByIndex(next);
  },
  toggleTour: () => set((s) => ({ tourActive: !s.tourActive })),
  setVolume: (v) => set({ volume: v }),
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
  setLanguage: (language) => set({ language }),
  toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
  setDate: (date) => set({ simTimeDays: daysSinceJ2000(date) }),
  setQuality: (quality) => set({ quality }),

  enterShip: () =>
    set((s) => {
      if (s.sceneMode.type !== 'solar') return {};
      return {
        sceneMode: { type: 'piloting' },
        tourActive: false,
        selected: null,
        focusObject: null,
        focusIndex: null,
        // Drop to near-real-time so planet motion feels natural while flying.
        prevSpeed: s.speed,
        speed: PILOT_TIME_SCALE,
      };
    }),
  exitShip: () =>
    set((s) => {
      if (s.sceneMode.type !== 'piloting') return {};
      return {
        sceneMode: { type: 'solar' },
        resetCounter: s.resetCounter + 1,
        // Restore the time-scale the player had before flying.
        speed: s.prevSpeed ?? s.speed,
        prevSpeed: null,
      };
    }),
  beginDescent: (target: string) => {
    const s = get();
    if (s.sceneMode.type !== 'piloting') return false;
    if (!isLandable(target)) return false;
    set({ sceneMode: { type: 'descending', target, phase: 'orbit' } });
    return true;
  },
  setDescentPhase: (phase) =>
    set((s) => {
      if (s.sceneMode.type !== 'descending') return {};
      return { sceneMode: { ...s.sceneMode, phase } };
    }),
  completeLanding: (planet: string) => set({ sceneMode: { type: 'surface', planet } }),
  // Step off the ship into the on-foot voxel world (and back).
  disembark: () =>
    set((s) => {
      if (s.sceneMode.type !== 'surface') return {};
      return { sceneMode: { type: 'voxel', planet: s.sceneMode.planet } };
    }),
  boardShip: () =>
    set((s) => {
      if (s.sceneMode.type !== 'voxel') return {};
      return { sceneMode: { type: 'surface', planet: s.sceneMode.planet } };
    }),
  beginAscent: () =>
    set((s) => {
      if (s.sceneMode.type !== 'surface') return {};
      return { sceneMode: { type: 'ascending', planet: s.sceneMode.planet } };
    }),
  completeAscent: () => set({ sceneMode: { type: 'piloting' } }),
  abortDescent: () => set({ sceneMode: { type: 'piloting' } }),
  setShipPosition: (shipPosition) => set({ shipPosition }),
  setShipVelocity: (shipVelocity) => set({ shipVelocity }),
  setShipRotation: (shipRotation) => set({ shipRotation }),
  setShipThrottle: (shipThrottle) => set({ shipThrottle }),
  setControls: (partial) => set((s) => ({ controls: { ...s.controls, ...partial } })),
  recordDiscovery: (e) => {
    const s = get();
    const key = `${e.planet}:${e.id}`;
    if (s.discovered[key]) return false;

    const discovered: Record<string, true> = { ...s.discovered, [key]: true };
    let journal: JournalEntry[] = [
      { key, planet: e.planet, name: e.name, story: e.story, clue: e.clue, ts: Date.now() },
      ...s.journal,
    ];
    let mysteryClues = s.mysteryClues;
    if (e.clue) {
      const mid = e.mysteryId ?? e.id;
      const tag = `${mid}:${e.id}`; // unique per POI, grouped by mystery
      if (!mysteryClues.includes(tag)) mysteryClues = [...mysteryClues, tag];
      const res = MYSTERY_RESOLUTIONS[mid];
      const resKey = `mystery:${mid}`;
      if (res && !discovered[resKey]) {
        const count = mysteryClues.filter((c) => c.startsWith(`${mid}:`)).length;
        if (count >= MYSTERY_THRESHOLD) {
          discovered[resKey] = true;
          journal = [
            { key: resKey, planet: '', name: res.name, story: res.story, ts: Date.now() },
            ...journal,
          ];
        }
      }
    }

    saveDiscovery({ discovered, journal, mysteryClues });
    set({ discovered, journal, mysteryClues });
    return true;
  },
}));

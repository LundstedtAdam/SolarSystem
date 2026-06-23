import { create } from 'zustand';
import type { Object3D } from 'three';
import { daysSinceJ2000, periodDays } from './systems/ephemeris';
import { PLANETS, type PlanetData } from './systems/bodies';
import { detectQuality, type Quality } from './systems/quality';
import type { Lang } from './i18n';

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

interface SimState {
  /** Time-scale multiplier driven by the speed slider. */
  speed: number;
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
}

export const useStore = create<SimState>((set, get) => ({
  speed: 1,
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
}));

import { create } from 'zustand';
import type { Object3D } from 'three';
import { daysSinceJ2000 } from './systems/ephemeris';

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
}

interface SimState {
  /** Time-scale multiplier driven by the speed slider. */
  speed: number;
  showOrbits: boolean;
  /** Body data for the info panel, or null when nothing is selected. */
  selected: SelectedBody | null;
  /** Live scene object the camera should frame/follow, or null. */
  focusObject: Object3D | null;
  /** Bumped whenever the user asks to reset the camera. */
  resetCounter: number;
  /** Simulation time in days since the J2000 epoch. */
  simTimeDays: number;
  paused: boolean;

  setSpeed: (speed: number) => void;
  toggleOrbits: () => void;
  select: (body: SelectedBody, object: Object3D) => void;
  reset: () => void;
  advanceTime: (deltaDays: number) => void;
  togglePause: () => void;
}

export const useStore = create<SimState>((set) => ({
  speed: 1,
  showOrbits: true,
  selected: null,
  focusObject: null,
  resetCounter: 0,
  simTimeDays: daysSinceJ2000(new Date()),
  paused: false,

  setSpeed: (speed) => set({ speed }),
  toggleOrbits: () => set((s) => ({ showOrbits: !s.showOrbits })),
  select: (body, object) => set({ selected: body, focusObject: object }),
  reset: () =>
    set((s) => ({
      selected: null,
      focusObject: null,
      resetCounter: s.resetCounter + 1,
    })),
  advanceTime: (deltaDays) => set((s) => ({ simTimeDays: s.simTimeDays + deltaDays })),
  togglePause: () => set((s) => ({ paused: !s.paused })),
}));

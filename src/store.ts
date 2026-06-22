import { create } from 'zustand';
import type { Object3D } from 'three';

/** Data shown in the info panel for the currently selected body. */
export interface SelectedBody {
  name: string;
  size: number;
  distance: number;
  speed: number;
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

  setSpeed: (speed: number) => void;
  toggleOrbits: () => void;
  select: (body: SelectedBody, object: Object3D) => void;
  reset: () => void;
}

export const useStore = create<SimState>((set) => ({
  speed: 1,
  showOrbits: true,
  selected: null,
  focusObject: null,
  resetCounter: 0,

  setSpeed: (speed) => set({ speed }),
  toggleOrbits: () => set((s) => ({ showOrbits: !s.showOrbits })),
  select: (body, object) => set({ selected: body, focusObject: object }),
  reset: () =>
    set((s) => ({
      selected: null,
      focusObject: null,
      resetCounter: s.resetCounter + 1,
    })),
}));

// Phase 10.3 — visual parameters for the world-anchored particle emitters.
// EmitterSpec (in contentProfiles) says WHERE/how-often an emitter appears; this
// says what it LOOKS like and how its particles move. Kept data-only so the
// Emitters component stays a thin animator.

import type { EmitterSpec } from './contentProfiles';

export interface EmitterVisual {
  color: [number, number, number];
  /** Point sprite size. */
  size: number;
  /** Particles per emitter instance. */
  particles: number;
  /** Vertical speed (voxels/s); negative falls. */
  rise: number;
  /** Horizontal radius the column occupies (voxels). */
  spread: number;
  /** Column height before a particle recycles to the base (voxels). */
  height: number;
  /** Tangential swirl rate (rad/s) — high for dust devils. */
  swirl: number;
  /** Additive blending for glowing plumes. */
  additive: boolean;
}

const VISUALS: Record<EmitterSpec['kind'], EmitterVisual> = {
  dust_devil: {
    color: [0.72, 0.46, 0.3],
    size: 0.5,
    particles: 40,
    rise: 2.5,
    spread: 2.4,
    height: 16,
    swirl: 2.2,
    additive: false,
  },
  fumarole: {
    color: [0.92, 0.82, 0.5],
    size: 0.6,
    particles: 30,
    rise: 5,
    spread: 1.2,
    height: 20,
    swirl: 0.35,
    additive: true,
  },
  geyser: {
    color: [0.72, 0.86, 1.0],
    size: 0.5,
    particles: 36,
    rise: 9,
    spread: 1.0,
    height: 30,
    swirl: 0.12,
    additive: true,
  },
  methane_bubble: {
    color: [0.62, 0.72, 0.72],
    size: 0.35,
    particles: 18,
    rise: 1.2,
    spread: 0.7,
    height: 4,
    swirl: 0.25,
    additive: false,
  },
  // Player-anchored; animated ballistically by Emitters, not as a column.
  vacuum_dust: {
    color: [0.7, 0.68, 0.64],
    size: 0.3,
    particles: 0,
    rise: 0,
    spread: 0,
    height: 0,
    swirl: 0,
    additive: false,
  },
};

export function getEmitterVisual(kind: EmitterSpec['kind']): EmitterVisual {
  return VISUALS[kind];
}

// Hot-path singleton exposing the asteroid belt's per-instance state and
// spatial grid to code outside the AsteroidBelt component tree (ship
// collision, mining, fracture) — same convention as `shipTelemetry.ts`: a
// plain mutable object read/written every frame, never a store subscription,
// since a store subscription here would re-render on every belt rebuild.

import type { AsteroidState } from '../systems/asteroidState';
import type { AsteroidGrid } from '../systems/asteroidGrid';

export const asteroidRuntime: {
  states: AsteroidState[];
  grid: AsteroidGrid | null;
  /** Belt-local yaw applied this frame (the whole-belt orbital drift) — ship/
   *  debris code must undo this before querying the grid, since the grid is
   *  built and indexed in belt-local space. */
  groupYaw: number;
  /** Set by AsteroidBelt.tsx on (re)build; zeroes the given asteroid's
   *  render instance and marks it dead. Null when no belt is mounted
   *  (e.g. quality 'low', asteroids: 0) — callers must check before use. */
  killAsteroid: ((globalIdx: number) => void) | null;
} = {
  states: [],
  grid: null,
  groupYaw: 0,
  killAsteroid: null,
};

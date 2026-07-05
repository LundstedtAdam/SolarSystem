// Hot-path singleton publishing the current-frame aim state (raycast against
// asteroids, run every frame regardless of firing) — same convention as
// `shipTelemetry.ts`/`asteroidRuntime.ts`: plain mutable data, no store
// subscription, so the crosshair/beam can react every frame without forcing
// a React re-render.

import { Vector3 } from 'three';

export const spaceMiningTelemetry: {
  /** True when the current-frame ray is within range of a live asteroid —
   *  drives the crosshair's on-target feedback independent of whether the
   *  player is actually firing. */
  aiming: boolean;
  /** World-space hit point this frame, or null on a miss. Reused by the
   *  visual beam so it doesn't need a second raycast. */
  hitPoint: Vector3 | null;
} = {
  aiming: false,
  hitPoint: null,
};

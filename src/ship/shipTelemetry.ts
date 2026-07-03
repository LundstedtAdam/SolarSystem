// Non-reactive, per-frame ship state while piloting. The ShipController writes
// here every frame and the ShipCamera reads it back the same frame, so the
// chase camera stays perfectly in sync — while the zustand store is only
// mirrored at a low rate for reactive UI (ShipHUD). Writing the store at 60 Hz
// re-rendered every subscribed HUD component each frame (the same reason the
// on-foot HUD polls `voxelTelemetry` instead of subscribing).
//
// Ownership: while `sceneMode.type === 'piloting'` this object is the live
// source of truth and the store lags by up to MIRROR_INTERVAL. In every other
// mode (descent/ascent/surface) the store is authoritative — the controller
// re-syncs from it on entering piloting and flushes back on leaving, so the
// hand-off in both directions is exact, never a stale mirror.

import { Quaternion, Vector3 } from 'three';
import { WORLD_SCALE } from '../systems/bodies';

/** Seconds between reactive-store mirrors of the live telemetry (10 Hz —
 *  smooth enough for the HUD throttle/speed readouts, 6x fewer renders). */
export const MIRROR_INTERVAL = 0.1;

export const shipTelemetry = {
  position: new Vector3(0, 50 * WORLD_SCALE, 500 * WORLD_SCALE),
  velocity: new Vector3(),
  rotation: new Quaternion(),
  /** Raw throttle lever position 0..1 (pre-curve), for HUD zones/effects. */
  throttle: 0,
};

/** Load the store's ship state into the live telemetry (entering piloting). */
export function syncTelemetryFromStore(
  pos: [number, number, number],
  vel: [number, number, number],
  rot: [number, number, number, number],
  throttle: number,
): void {
  shipTelemetry.position.set(pos[0], pos[1], pos[2]);
  shipTelemetry.velocity.set(vel[0], vel[1], vel[2]);
  shipTelemetry.rotation.set(rot[0], rot[1], rot[2], rot[3]);
  shipTelemetry.throttle = throttle;
}

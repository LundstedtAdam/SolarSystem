// Elite Dangerous-style virtual joystick for mouse flight. Raw pointer deltas
// accumulate into a 2D stick vector (x = yaw, y = pitch) clamped to a maximum
// deflection radius; each frame the stick springs back toward center with an
// exponential decay, so holding the mouse still recenters the controls. The
// ShipController reads the normalized stick each frame and feeds it into the
// flight model. Mirrors the module-level shape of cameraLook.ts.

import { useStore, DEFAULT_MOUSE_SENSITIVITY } from '../store';

/** Pointer travel (px) to full deflection scales by this gain, at the default
 *  "Mouse/touch sensitivity" setting. */
const MOUSE_GAIN = 0.012;
/** Maximum stick deflection radius; output is normalized by this. */
const MAX_DEFLECTION = 1;
/** Per-frame (@60fps) retention of the spring decay back to center. A lower
 *  value recenters faster. ~0.65 gives a snappy but smooth self-centering feel. */
const RELATIVE_MOUSE_RATE = 0.65;
/** Yaw is intentionally weaker than pitch/roll to force cinematic banking. */
export const YAW_WEIGHT = 0.6;

let stickX = 0; // yaw axis
let stickY = 0; // pitch axis
/** True only on frames that received fresh pointer input (skip decay then). */
let fedThisFrame = false;

function clampRadius() {
  const m = Math.hypot(stickX, stickY);
  if (m > MAX_DEFLECTION) {
    const s = MAX_DEFLECTION / m;
    stickX *= s;
    stickY *= s;
  }
}

/** Accumulate a raw pointer delta (px) into the stick, clamped to the radius.
 *  Scaled by the "Mouse/touch sensitivity" setting, relative to its default
 *  (so MOUSE_GAIN's tuned feel is exactly reproduced at the default value). */
export function addStickInput(dx: number, dy: number) {
  const scale = useStore.getState().controls.mouseSensitivity / DEFAULT_MOUSE_SENSITIVITY;
  stickX += dx * MOUSE_GAIN * scale;
  stickY += dy * MOUSE_GAIN * scale;
  clampRadius();
  fedThisFrame = true;
}

/**
 * Spring the stick back toward center. Frame-rate independent: the per-frame
 * retention is raised to dt*60 so the feel is identical at any FPS. Decay is
 * skipped on frames that received fresh input so active aiming holds deflection.
 */
export function decayStick(dt: number) {
  if (fedThisFrame) {
    fedThisFrame = false;
    return;
  }
  const factor = Math.pow(RELATIVE_MOUSE_RATE, dt * 60);
  stickX *= factor;
  stickY *= factor;
}

/** Normalized stick in [-1,1]. Yaw (x) is pre-weakened for banking turns. */
export function getStick(): { x: number; y: number } {
  return { x: (stickX / MAX_DEFLECTION) * YAW_WEIGHT, y: stickY / MAX_DEFLECTION };
}

/** True when the stick is meaningfully deflected (mouse flight is active). */
export function stickActive(): boolean {
  return Math.hypot(stickX, stickY) > 0.001;
}

export function resetStick() {
  stickX = 0;
  stickY = 0;
  fedThisFrame = false;
}

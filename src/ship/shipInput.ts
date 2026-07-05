import type { ShipInput } from './shipPhysics';
import { useStore } from '../store';
import { getStick, stickActive } from './virtualStick';

const keys = new Set<string>();

function onKeyDown(e: KeyboardEvent) {
  keys.add(e.key.toLowerCase());
}

function onKeyUp(e: KeyboardEvent) {
  keys.delete(e.key.toLowerCase());
}

// Losing window focus swallows the matching keyup events — without this a
// key held through Alt-Tab would stay "down" forever (ship stuck at full
// thrust until the key is pressed and released again).
function onBlur() {
  keys.clear();
}

let installed = false;

export function installKeyboardListeners() {
  if (installed) return;
  installed = true;
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
}

export function removeKeyboardListeners() {
  installed = false;
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('blur', onBlur);
  keys.clear();
}

function axis(neg: string, pos: string): number {
  let v = 0;
  if (keys.has(neg)) v -= 1;
  if (keys.has(pos)) v += 1;
  return v;
}

/** S-curve exponent: soft, precise around center, full authority at the edges. */
const EXPO = 1.5;

/**
 * Dead zone + S-curve response shaping for a single analog axis (used for roll).
 * Below the dead zone the output is exactly zero; beyond it the remaining travel
 * is rescaled to the full 0..1 range and passed through an expo curve so small
 * stick movements are gentle and large ones reach full deflection.
 */
function shapeAxis(raw: number, deadzone: number, invert = false): number {
  const v = invert ? -raw : raw;
  const a = Math.abs(v);
  if (a <= deadzone) return 0;
  const t = (a - deadzone) / (1 - deadzone);
  return Math.sign(v) * Math.pow(t, EXPO);
}

/**
 * Normalized RADIAL dead zone + S-curve for a 2D stick (x, y together). Using the
 * Euclidean magnitude — never per-axis (axial) dead zones — avoids cardinal-axis
 * snapping where diagonal input collapses onto the nearest axis. Below the dead
 * zone the output is zero; beyond it the magnitude is rescaled to [0,1], shaped by
 * the expo curve, and the original direction is preserved.
 */
function shapeRadial(x: number, y: number, deadzone: number): { x: number; y: number } {
  const m = Math.hypot(x, y);
  if (m < deadzone) return { x: 0, y: 0 };
  const scaled = (m - deadzone) / (1 - deadzone);
  const shaped = Math.pow(scaled, EXPO);
  const k = shaped / m; // rescale factor keeping direction (x/m, y/m)
  return { x: x * k, y: y * k };
}

/**
 * Four-zone throttle response. The slider's first three quarters each cover only
 * 10% of max thrust (fine, precise low-end control); the final quarter ramps from
 * 30% to 100% (the aggressive power band). Linear within each zone and continuous
 * at the boundaries, so there is no stepping — only a change of slope.
 *   slider 0–25%   -> 0–10%
 *   slider 25–50%  -> 10–20%
 *   slider 50–75%  -> 20–30%
 *   slider 75–100% -> 30–100%
 */
export function throttleCurve(raw: number): number {
  const s = Math.min(Math.abs(raw), 1);
  let out: number;
  if (s < 0.25) out = (s / 0.25) * 0.1;
  else if (s < 0.5) out = 0.1 + ((s - 0.25) / 0.25) * 0.1;
  else if (s < 0.75) out = 0.2 + ((s - 0.5) / 0.25) * 0.1;
  else out = 0.3 + ((s - 0.75) / 0.25) * 0.7;
  return Math.sign(raw) * out;
}

export function readKeyboard(): ShipInput {
  return {
    // Throttle on W (forward) / S (reverse). Shift is the fine-control modifier.
    thrust: keys.has('w') ? 1 : keys.has('s') ? -0.3 : 0,
    yaw: axis('a', 'd'),
    pitch: axis('arrowup', 'arrowdown'),
    roll: axis('q', 'e'),
  };
}

/** True while Shift is held — the momentary fine-control modifier. */
export function fineControlHeld(): boolean {
  return keys.has('shift');
}

/** True while the gamepad's left bumper (LB/L1, button 4) is held — the pad's
 *  momentary fine-control modifier, mirroring Shift on the keyboard. */
export function gamepadFineHeld(): boolean {
  const gamepads = navigator.getGamepads?.();
  if (!gamepads) return false;
  for (const gp of gamepads) {
    if (gp) return !!gp.buttons[4]?.pressed;
  }
  return false;
}

/** Raw gamepad axes (no shaping); null when no pad is present. */
function readGamepadRaw(): ShipInput | null {
  const gamepads = navigator.getGamepads?.();
  if (!gamepads) return null;
  for (const gp of gamepads) {
    if (!gp) continue;
    return {
      yaw: gp.axes[0] ?? 0,
      pitch: gp.axes[1] ?? 0,
      roll: gp.axes[2] ?? 0,
      thrust: (gp.buttons[7]?.value ?? 0) - (gp.buttons[6]?.value ?? 0),
    };
  }
  return null;
}

let touchYaw = 0;
let touchPitch = 0;
let touchThrust = 0;
let joystickActive = false;

/** Raw, unshaped joystick vector — shaping happens centrally in readInput(). */
export function setTouchJoystick(yaw: number, pitch: number) {
  touchYaw = yaw;
  touchPitch = pitch;
  joystickActive = true;
}

export function clearTouchJoystick() {
  touchYaw = 0;
  touchPitch = 0;
  joystickActive = false;
}

export function setTouchThrottle(t: number) {
  touchThrust = t;
}

/** Fine control softens rotation and caps thrust so close-quarters work is
 *  precise. Applied as the last shaping step, after the source is chosen. */
const FINE_ROTATION = 0.4;
const FINE_THRUST_CAP = 0.25;

function applyFineControl(input: ShipInput): ShipInput {
  const t = input.thrust;
  return {
    thrust: Math.sign(t) * Math.min(Math.abs(t), FINE_THRUST_CAP),
    throttleRaw: Math.min(input.throttleRaw ?? Math.abs(t), FINE_THRUST_CAP),
    yaw: input.yaw * FINE_ROTATION,
    pitch: input.pitch * FINE_ROTATION,
    roll: input.roll * FINE_ROTATION,
  };
}

/**
 * Unified input read with priority gamepad > touch > mouse stick / keyboard. The
 * active source is shaped per the player's control config (dead zone, expo curve,
 * invert) so every downstream consumer sees a clean, normalized
 * {thrust, yaw, pitch, roll}. Fine control (Shift) is layered on last.
 */
export function readInput(): ShipInput {
  const cfg = useStore.getState().controls;
  // Effective fine control: the persistent settings toggle OR Shift OR LB held.
  const fine = cfg.fineControl || fineControlHeld() || gamepadFineHeld();
  const finish = (input: ShipInput): ShipInput => (fine ? applyFineControl(input) : input);

  const gp = readGamepadRaw();
  if (
    gp &&
    (Math.abs(gp.thrust) > 0.15 ||
      Math.abs(gp.yaw) > 0.15 ||
      Math.abs(gp.pitch) > 0.15 ||
      Math.abs(gp.roll) > 0.15)
  ) {
    // Normalized radial dead zone on the (yaw, pitch) pair — no cardinal snapping.
    const aim = shapeRadial(gp.yaw, gp.pitch, cfg.deadzone);
    return finish({
      thrust: throttleCurve(gp.thrust),
      throttleRaw: Math.min(Math.abs(gp.thrust), 1),
      yaw: aim.x,
      pitch: cfg.invertPitch ? -aim.y : aim.y,
      roll: shapeAxis(gp.roll, cfg.deadzone),
    });
  }

  if (joystickActive || Math.abs(touchThrust) > 0.01) {
    const aim = shapeRadial(touchYaw, touchPitch, cfg.deadzone);
    return finish({
      thrust: throttleCurve(touchThrust),
      throttleRaw: Math.min(Math.abs(touchThrust), 1),
      yaw: aim.x,
      pitch: cfg.invertPitch ? -aim.y : aim.y,
      roll: 0,
    });
  }

  // Mouse virtual joystick: flies the ship while the pointer is locked. Thrust
  // still comes from the keyboard (W/S). The stick is already normalized [-1,1]
  // and yaw-weakened, so it skips the dead-zone/expo shaping.
  const kb = readKeyboard();
  if (stickActive()) {
    const s = getStick();
    return finish({
      thrust: kb.thrust,
      throttleRaw: Math.min(Math.abs(kb.thrust), 1),
      yaw: s.x,
      pitch: cfg.invertPitch ? -s.y : s.y,
      roll: kb.roll,
    });
  }

  // Keyboard is digital (±1); only the invert preference applies.
  return finish({
    thrust: kb.thrust,
    throttleRaw: Math.min(Math.abs(kb.thrust), 1),
    yaw: kb.yaw,
    pitch: cfg.invertPitch ? -kb.pitch : kb.pitch,
    roll: kb.roll,
  });
}

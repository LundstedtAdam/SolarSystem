import type { ShipInput } from './shipPhysics';
import { useStore } from '../store';

const keys = new Set<string>();

function onKeyDown(e: KeyboardEvent) {
  keys.add(e.key.toLowerCase());
}

function onKeyUp(e: KeyboardEvent) {
  keys.delete(e.key.toLowerCase());
}

let installed = false;

export function installKeyboardListeners() {
  if (installed) return;
  installed = true;
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
}

export function removeKeyboardListeners() {
  installed = false;
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  keys.clear();
}

function axis(neg: string, pos: string): number {
  let v = 0;
  if (keys.has(neg)) v -= 1;
  if (keys.has(pos)) v += 1;
  return v;
}

/** S-curve exponent: soft, precise around center, full authority at the edges. */
const EXPO = 1.7;

/**
 * Dead zone + S-curve response shaping for an analog axis. Below the dead zone
 * the output is exactly zero; beyond it the remaining travel is rescaled to the
 * full 0..1 range and passed through an expo curve so small stick movements are
 * gentle and large ones reach full deflection.
 */
function shapeAxis(raw: number, deadzone: number, invert = false): number {
  let v = invert ? -raw : raw;
  const a = Math.abs(v);
  if (a <= deadzone) return 0;
  const t = (a - deadzone) / (1 - deadzone);
  return Math.sign(v) * Math.pow(t, EXPO);
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
    thrust: keys.has('shift') ? 1 : keys.has('control') ? -0.3 : (keys.has('w') ? 1 : keys.has('s') ? -0.3 : 0),
    yaw: axis('a', 'd'),
    pitch: axis('arrowup', 'arrowdown'),
    roll: axis('q', 'e'),
  };
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

/**
 * Unified input read with priority gamepad > touch > keyboard. The active source
 * is shaped per the player's control config (dead zone, expo curve, invert) so
 * every downstream consumer sees a clean, normalized {thrust, yaw, pitch, roll}.
 */
export function readInput(): ShipInput {
  const cfg = useStore.getState().controls;

  const gp = readGamepadRaw();
  if (
    gp &&
    (Math.abs(gp.thrust) > 0.15 ||
      Math.abs(gp.yaw) > 0.15 ||
      Math.abs(gp.pitch) > 0.15 ||
      Math.abs(gp.roll) > 0.15)
  ) {
    // Gamepads sit at the tighter end of the dead-zone range (5–10%).
    const gdz = Math.min(cfg.deadzone * 0.6, 0.1);
    return {
      thrust: throttleCurve(gp.thrust),
      throttleRaw: Math.min(Math.abs(gp.thrust), 1),
      yaw: shapeAxis(gp.yaw, gdz),
      pitch: shapeAxis(gp.pitch, gdz, cfg.invertPitch),
      roll: shapeAxis(gp.roll, gdz),
    };
  }

  if (joystickActive || Math.abs(touchThrust) > 0.01) {
    return {
      thrust: throttleCurve(touchThrust),
      throttleRaw: Math.min(Math.abs(touchThrust), 1),
      yaw: shapeAxis(touchYaw, cfg.deadzone),
      pitch: shapeAxis(touchPitch, cfg.deadzone, cfg.invertPitch),
      roll: 0,
    };
  }

  // Keyboard is digital (±1); only the invert preference applies.
  const kb = readKeyboard();
  return {
    thrust: kb.thrust,
    throttleRaw: Math.min(Math.abs(kb.thrust), 1),
    yaw: kb.yaw,
    pitch: cfg.invertPitch ? -kb.pitch : kb.pitch,
    roll: kb.roll,
  };
}

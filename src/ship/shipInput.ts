import type { ShipInput } from './shipPhysics';

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

export function readKeyboard(): ShipInput {
  return {
    thrust: keys.has('shift') ? 1 : keys.has('control') ? -0.3 : (keys.has('w') ? 1 : keys.has('s') ? -0.3 : 0),
    yaw: axis('a', 'd'),
    pitch: axis('arrowup', 'arrowdown'),
    roll: axis('q', 'e'),
  };
}

export function readGamepad(): ShipInput | null {
  const gamepads = navigator.getGamepads?.();
  if (!gamepads) return null;
  for (const gp of gamepads) {
    if (!gp) continue;
    const deadZone = 0.15;
    const applyDead = (v: number) => (Math.abs(v) < deadZone ? 0 : v);
    return {
      yaw: applyDead(gp.axes[0] ?? 0),
      pitch: applyDead(gp.axes[1] ?? 0),
      roll: applyDead(gp.axes[2] ?? 0),
      thrust: (gp.buttons[7]?.value ?? 0) - (gp.buttons[6]?.value ?? 0),
    };
  }
  return null;
}

let touchYaw = 0;
let touchPitch = 0;
let touchThrust = 0;
let joystickActive = false;

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

export function readInput(): ShipInput {
  const gp = readGamepad();
  if (gp && (Math.abs(gp.thrust) > 0.1 || Math.abs(gp.yaw) > 0.1 || Math.abs(gp.pitch) > 0.1)) {
    return gp;
  }
  if (joystickActive || Math.abs(touchThrust) > 0.01) {
    return { thrust: touchThrust, yaw: touchYaw, pitch: touchPitch, roll: 0 };
  }
  return readKeyboard();
}

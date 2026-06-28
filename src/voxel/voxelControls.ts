// Unified voxel input. A single shared state object is written by whichever
// source is active — pointer-lock + WASD on desktop, the on-screen joystick /
// look-drag / jump on touch (mobile-first) — and read once per frame by the
// PlayerController. Look deltas accumulate and are consumed each frame.

export interface VoxelInputState {
  /** -1..1 strafe (x) and forward (z). */
  move: { x: number; z: number };
  /** Pending look delta in pixels (consumed per frame). */
  look: { dx: number; dy: number };
  jump: boolean;
  run: boolean;
  /** Edge-triggered dig request (tap / click at the crosshair). */
  dig: boolean;
  /** Edge-triggered scan request (Scan button / E key / left trigger). */
  scan: boolean;
}

export const voxelInput: VoxelInputState = {
  move: { x: 0, z: 0 },
  look: { dx: 0, dy: 0 },
  jump: false,
  run: false,
  dig: false,
  scan: false,
};

/** Whether a scannable POI is currently in range and roughly in the crosshair.
 *  Written by the DiscoveryPanel each poll, read by the Scan button so it only
 *  lights up when a single tap would actually record something. Non-reactive to
 *  avoid 60fps React churn — the button polls it. */
export const voxelScan = { available: false };

/** Live player telemetry for the on-foot HUD (non-reactive; polled via rAF so
 *  the compass never forces a 60fps React re-render). Updated by the
 *  PlayerController each frame; the ship sits at the world origin. */
export const voxelTelemetry = { x: 0, z: 0, yaw: 0 };

export function consumeLook(): { dx: number; dy: number } {
  const d = { dx: voxelInput.look.dx, dy: voxelInput.look.dy };
  voxelInput.look.dx = 0;
  voxelInput.look.dy = 0;
  return d;
}

/** Read and clear the one-shot dig request. */
export function consumeDig(): boolean {
  const d = voxelInput.dig;
  voxelInput.dig = false;
  return d;
}

/** Read and clear the one-shot scan request. */
export function consumeScan(): boolean {
  const s = voxelInput.scan;
  voxelInput.scan = false;
  return s;
}

export function resetVoxelInput(): void {
  voxelInput.move.x = 0;
  voxelInput.move.z = 0;
  voxelInput.look.dx = 0;
  voxelInput.look.dy = 0;
  voxelInput.jump = false;
  voxelInput.run = false;
  voxelInput.dig = false;
  voxelInput.scan = false;
}

/** Desktop: pointer-lock mouse look + WASD/Space/Shift. Returns a disposer. */
export function attachDesktopControls(dom: HTMLElement): () => void {
  const keys: Record<string, boolean> = {};
  const refreshKeys = () => {
    voxelInput.move.x = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
    voxelInput.move.z = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
    voxelInput.run = !!(keys['ShiftLeft'] || keys['ShiftRight']);
    voxelInput.jump = !!keys['Space'];
  };
  const kd = (e: KeyboardEvent) => {
    if (e.code === 'Space') e.preventDefault();
    keys[e.code] = true;
    refreshKeys();
  };
  const ku = (e: KeyboardEvent) => {
    keys[e.code] = false;
    refreshKeys();
  };
  const onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement === dom) {
      voxelInput.look.dx += e.movementX;
      voxelInput.look.dy += e.movementY;
    }
  };
  // Left click captures the pointer (mouse look); right click digs the voxel
  // under the crosshair.
  const onPointerDown = (e: MouseEvent) => {
    if (e.button === 2) {
      voxelInput.dig = true;
      return;
    }
    if (e.button === 0 && document.pointerLockElement !== dom) dom.requestPointerLock?.();
  };
  const onContext = (e: Event) => e.preventDefault();

  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  window.addEventListener('mousemove', onMouseMove);
  dom.addEventListener('pointerdown', onPointerDown);
  dom.addEventListener('contextmenu', onContext);

  return () => {
    window.removeEventListener('keydown', kd);
    window.removeEventListener('keyup', ku);
    window.removeEventListener('mousemove', onMouseMove);
    dom.removeEventListener('pointerdown', onPointerDown);
    dom.removeEventListener('contextmenu', onContext);
    if (document.pointerLockElement === dom) document.exitPointerLock();
    resetVoxelInput();
  };
}

/** True when the device's primary input is touch. */
export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
}

const DEG2RAD = Math.PI / 180;

/**
 * Minecraft-style cubic look sensitivity. For a raw pixel delta `px` and the
 * mouse-sensitivity setting (0.3–3.0, mapped to s = sens/3 in 0..1):
 *   Δdeg = 1.2 × px × (0.6·s + 0.2)³
 * At the default (sens 1.5 → s 0.5) this is ~0.15°/px. Returns radians. The same
 * curve is used for mouse and touch look (touch passes its drag delta as `px`).
 */
export function cubicLook(px: number, mouseSensitivity: number): number {
  const s = Math.max(0, Math.min(1, mouseSensitivity / 3));
  const k = 0.6 * s + 0.2;
  return 1.2 * px * k * k * k * DEG2RAD;
}

/**
 * Normalized RADIAL dead zone + S-curve (exponent 1.5) for a 2D joystick vector
 * — the same math as the gamepad/ship aim shaping. Never axial, so diagonals
 * don't snap to the cardinal axes. Mutates nothing; returns the shaped vector.
 */
export function radialShape(x: number, y: number, deadzone: number): { x: number; y: number } {
  const m = Math.hypot(x, y);
  if (m < deadzone) return { x: 0, y: 0 };
  const scaled = (m - deadzone) / (1 - deadzone);
  const shaped = Math.pow(scaled, 1.5);
  const k = shaped / m;
  return { x: x * k, y: y * k };
}

// --- Gamepad on the surface (Phase 11) -------------------------------------
// Right-stick look gain: pixels-equivalent per second at full deflection. The
// delta is fed through the same cubicLook curve as mouse/touch, so the feel
// matches. Triggers are treated as buttons with a 0.4 press threshold.
const PAD_LOOK_GAIN = 1100;
const TRIGGER_THRESHOLD = 0.4;
const padPrev = { dig: false, scan: false, back: false };

function padButton(gp: Gamepad, i: number): boolean {
  return !!gp.buttons[i]?.pressed;
}

/**
 * Poll the first connected gamepad and write the shared voxelInput, matching the
 * flight deadzone/curves. Left stick moves, right stick looks (accumulated as a
 * pixel-equivalent delta), A jumps, right trigger digs, left trigger scans, B
 * returns to the ship. Edge-triggered actions fire once per press. Returns
 * `back` so the caller can board the ship. No-op (and returns false) when no pad
 * is connected, so keyboard/touch keep working on devices without one.
 */
export function pollVoxelGamepad(dt: number, deadzone: number): { back: boolean } {
  const pads = navigator.getGamepads?.();
  if (!pads) return { back: false };
  let gp: Gamepad | null = null;
  for (const p of pads) {
    if (p) {
      gp = p;
      break;
    }
  }
  if (!gp) {
    padPrev.dig = padPrev.scan = padPrev.back = false;
    return { back: false };
  }

  // Move — left stick, radial deadzone + S-curve. Forward is -Y on the stick.
  const mv = radialShape(gp.axes[0] ?? 0, gp.axes[1] ?? 0, deadzone);
  voxelInput.move.x = mv.x;
  voxelInput.move.z = -mv.y;

  // Look — right stick, radial deadzone, accumulated as pixel-equivalent so it
  // runs through the shared cubicLook curve downstream.
  const lk = radialShape(gp.axes[2] ?? 0, gp.axes[3] ?? 0, deadzone);
  voxelInput.look.dx += lk.x * PAD_LOOK_GAIN * dt;
  voxelInput.look.dy += lk.y * PAD_LOOK_GAIN * dt;

  // A (0) jump held; LB/L1 (4) run.
  voxelInput.jump = padButton(gp, 0);
  voxelInput.run = padButton(gp, 4);

  // Right trigger (7) dig, left trigger (6) scan — edge-triggered one-shots.
  const digDown = (gp.buttons[7]?.value ?? 0) > TRIGGER_THRESHOLD;
  if (digDown && !padPrev.dig) voxelInput.dig = true;
  padPrev.dig = digDown;

  const scanDown = (gp.buttons[6]?.value ?? 0) > TRIGGER_THRESHOLD;
  if (scanDown && !padPrev.scan) voxelInput.scan = true;
  padPrev.scan = scanDown;

  // B (1) — back to ship, edge-triggered.
  const backDown = padButton(gp, 1);
  const back = backDown && !padPrev.back;
  padPrev.back = backDown;

  return { back };
}

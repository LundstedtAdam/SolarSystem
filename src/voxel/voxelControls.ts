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
  /** Held continuous-mining request (touch Dig button / left mouse / RT held). */
  mine: boolean;
  /** Edge-triggered scan request (Scan button / E key / left trigger). */
  scan: boolean;
  /** Edge-triggered place request (Place button / right mouse / pad X). */
  place: boolean;
  /** Edge-triggered deposit-into-silo request (Deposit button / F / pad Y). */
  deposit: boolean;
  /** Edge-triggered open-silo-contents request (Silo button / V / pad RB) —
   *  gamepad-only plumbing; touch/desktop click the Silo button directly. */
  openSilo: boolean;
}

export const voxelInput: VoxelInputState = {
  move: { x: 0, z: 0 },
  look: { dx: 0, dy: 0 },
  jump: false,
  run: false,
  mine: false,
  scan: false,
  place: false,
  deposit: false,
  openSilo: false,
};

/** Whether a scannable POI is currently in range and roughly in the crosshair.
 *  Written by the DiscoveryPanel each poll, read by the Scan button so it only
 *  lights up when a single tap would actually record something. Non-reactive to
 *  avoid 60fps React churn — the button polls it. */
export const voxelScan = { available: false };

/** Nearest storage silo within range (id, or -1) — drives the contextual
 *  Deposit and Silo (view/withdraw) buttons (non-reactive; polled). */
export const voxelSilo = { available: false, id: -1 };

/** Nearest crafting station within range (id, or -1) — drives the Craft button. */
export const voxelStation = { available: false, id: -1 };

/** Live player telemetry for the on-foot HUD (non-reactive; polled via rAF so
 *  the compass never forces a 60fps React re-render). Updated by the
 *  PlayerController each frame; the ship sits at the world origin. */
export const voxelTelemetry = { x: 0, y: 0, z: 0, yaw: 0 };

export function consumeLook(): { dx: number; dy: number } {
  const d = { dx: voxelInput.look.dx, dy: voxelInput.look.dy };
  voxelInput.look.dx = 0;
  voxelInput.look.dy = 0;
  return d;
}

/** Read and clear the one-shot scan request. */
export function consumeScan(): boolean {
  const s = voxelInput.scan;
  voxelInput.scan = false;
  return s;
}

/** Read and clear the one-shot place request. */
export function consumePlace(): boolean {
  const p = voxelInput.place;
  voxelInput.place = false;
  return p;
}

/** Read and clear the one-shot deposit request. */
export function consumeDeposit(): boolean {
  const d = voxelInput.deposit;
  voxelInput.deposit = false;
  return d;
}

/** Read and clear the one-shot open-silo-contents request. */
export function consumeOpenSilo(): boolean {
  const o = voxelInput.openSilo;
  voxelInput.openSilo = false;
  return o;
}

export function resetVoxelInput(): void {
  voxelInput.move.x = 0;
  voxelInput.move.z = 0;
  voxelInput.look.dx = 0;
  voxelInput.look.dy = 0;
  voxelInput.jump = false;
  voxelInput.run = false;
  voxelInput.mine = false;
  voxelInput.scan = false;
  voxelInput.place = false;
  voxelInput.deposit = false;
  voxelInput.openSilo = false;
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
    if (e.code === 'KeyF') voxelInput.deposit = true; // deposit into nearby silo
    if (e.code === 'KeyV') voxelInput.openSilo = true; // view/withdraw nearby silo
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
  // Left click captures the pointer; once locked, holding the left button mines
  // the voxel under the crosshair continuously (release to stop).
  const onPointerDown = (e: MouseEvent) => {
    if (e.button === 0) {
      if (document.pointerLockElement !== dom) dom.requestPointerLock?.();
      else voxelInput.mine = true;
    } else if (e.button === 2 && document.pointerLockElement === dom) {
      voxelInput.place = true; // right-click places the active buildable
    }
  };
  const onPointerUp = (e: MouseEvent) => {
    if (e.button === 0) voxelInput.mine = false;
  };
  const onContext = (e: Event) => e.preventDefault();

  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  window.addEventListener('mousemove', onMouseMove);
  dom.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('mouseup', onPointerUp);
  dom.addEventListener('contextmenu', onContext);

  return () => {
    window.removeEventListener('keydown', kd);
    window.removeEventListener('keyup', ku);
    window.removeEventListener('mousemove', onMouseMove);
    dom.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('mouseup', onPointerUp);
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
const padPrev = { scan: false, back: false, place: false, deposit: false, openSilo: false };

function padButton(gp: Gamepad, i: number): boolean {
  return !!gp.buttons[i]?.pressed;
}

/**
 * Poll the first connected gamepad and write the shared voxelInput, matching the
 * flight deadzone/curves. Left stick moves, right stick looks (accumulated as a
 * pixel-equivalent delta), A jumps, right trigger digs, left trigger scans, B
 * returns to the ship, X places, Y deposits into a nearby silo, RB opens a
 * nearby silo's contents to view/withdraw. Edge-triggered actions fire once per
 * press. Returns `back` so the caller can board the ship. No-op (and returns
 * false) when no pad is connected, so keyboard/touch keep working on devices
 * without one.
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
    // No pad: leave voxelInput.mine alone — it's owned by the touch Dig button /
    // left-mouse here. (Only the gamepad branch below sets mine, from RT.)
    padPrev.scan = padPrev.back = padPrev.place = padPrev.deposit = padPrev.openSilo = false;
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

  // Right trigger (7) held = continuous mine; left trigger (6) scan = one-shot.
  voxelInput.mine = (gp.buttons[7]?.value ?? 0) > TRIGGER_THRESHOLD;

  const scanDown = (gp.buttons[6]?.value ?? 0) > TRIGGER_THRESHOLD;
  if (scanDown && !padPrev.scan) voxelInput.scan = true;
  padPrev.scan = scanDown;

  // X (2) place, Y (3) deposit — edge-triggered.
  const placeDown = padButton(gp, 2);
  if (placeDown && !padPrev.place) voxelInput.place = true;
  padPrev.place = placeDown;

  const depositDown = padButton(gp, 3);
  if (depositDown && !padPrev.deposit) voxelInput.deposit = true;
  padPrev.deposit = depositDown;

  // RB (5) — open the nearby silo's contents to view/withdraw, edge-triggered.
  const openSiloDown = padButton(gp, 5);
  if (openSiloDown && !padPrev.openSilo) voxelInput.openSilo = true;
  padPrev.openSilo = openSiloDown;

  // B (1) — back to ship, edge-triggered.
  const backDown = padButton(gp, 1);
  const back = backDown && !padPrev.back;
  padPrev.back = backDown;

  return { back };
}

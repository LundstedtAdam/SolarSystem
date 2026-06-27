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
}

export const voxelInput: VoxelInputState = {
  move: { x: 0, z: 0 },
  look: { dx: 0, dy: 0 },
  jump: false,
  run: false,
};

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

export function resetVoxelInput(): void {
  voxelInput.move.x = 0;
  voxelInput.move.z = 0;
  voxelInput.look.dx = 0;
  voxelInput.look.dy = 0;
  voxelInput.jump = false;
  voxelInput.run = false;
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
  const onClick = () => {
    if (document.pointerLockElement !== dom) dom.requestPointerLock?.();
  };

  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  window.addEventListener('mousemove', onMouseMove);
  dom.addEventListener('click', onClick);

  return () => {
    window.removeEventListener('keydown', kd);
    window.removeEventListener('keyup', ku);
    window.removeEventListener('mousemove', onMouseMove);
    dom.removeEventListener('click', onClick);
    if (document.pointerLockElement === dom) document.exitPointerLock();
    resetVoxelInput();
  };
}

/** True when the device's primary input is touch. */
export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
}

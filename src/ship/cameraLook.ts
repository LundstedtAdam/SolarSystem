// Shared third-person chase-camera orbit offset, fed by touch drag (mobile) and
// the Pointer Lock API (desktop). The ShipCamera reads these angles each frame
// and orbits around the ship; when the player stops dragging, the view eases
// back to the default behind-the-ship framing for a cinematic resting pose.

const MAX_YAW = 2.6; // ~150° each way
const MAX_PITCH = 1.1; // ~63° each way
/** Radians of orbit per pixel of pointer travel. */
const LOOK_SENS = 0.005;
/** How fast the camera recenters behind the ship once released (1/s). */
const RECENTER_RATE = 2;

let yaw = 0;
let pitch = 0;
let dragging = false;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/** Apply a pointer delta (px). Grab-the-world feel: drag right looks left. */
export function addCameraLook(dx: number, dy: number) {
  yaw = clamp(yaw - dx * LOOK_SENS, -MAX_YAW, MAX_YAW);
  pitch = clamp(pitch - dy * LOOK_SENS, -MAX_PITCH, MAX_PITCH);
  dragging = true;
}

export function endCameraLook() {
  dragging = false;
}

export function getCameraLook(): { yaw: number; pitch: number } {
  return { yaw, pitch };
}

/** Ease the orbit back to center while the player isn't actively dragging. */
export function decayCameraLook(dt: number) {
  if (dragging) return;
  const k = 1 - Math.exp(-RECENTER_RATE * dt);
  yaw += (0 - yaw) * k;
  pitch += (0 - pitch) * k;
}

export function resetCameraLook() {
  yaw = 0;
  pitch = 0;
  dragging = false;
}

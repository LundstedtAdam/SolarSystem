// Projectile mining/weapon system for space (asteroids only — no ship-to-ship
// combat, no NPCs; this repo has no combat system at all today). Aiming
// mirrors the voxel mining convention (a fixed screen-center ray) for the
// *direction* a shot launches in, but a shot is a real traveling projectile
// (see projectileRuntime.ts/projectilePhysics.ts) — spawned at the ship's
// weapon hardpoint, not resolved instantly from the camera. `raycastAsteroids`
// here is the swept-segment collision test the projectile's own per-frame
// update calls (this module owns it since it's also still used for the
// crosshair's continuous "is something targetable" aim-assist query),
// broadphased through the belt's spatial grid so it never iterates the full
// asteroid population. Fire is discrete, automatic shots at a fixed cadence
// while held (not a continuous beam); each connecting hit feeds the same
// `applyAsteroidDamage` pipeline collision damage uses, so sustained fire
// naturally produces low/medium/high fracture outcomes over several shots.

import { Vector3 } from 'three';
import { queryNearby } from '../systems/asteroidGrid';
import { TIERS } from '../systems/asteroidLayout';
import { asteroidRuntime } from '../scene/asteroidRuntime';
import { rotateY } from './shipCollision';

/** Max range (world units) a shot can travel before it's spent. */
export const MINING_RANGE = 60;
/** Automatic fire cadence while the trigger is held (shots/sec). */
export const FIRE_RATE = 6;
/** Damage dealt per individual shot. */
export const SHOT_DAMAGE = 3;
/** Projectile travel speed (world units/sec), before adding the ship's own
 *  velocity (real momentum transfer — a shot fired while moving inherits the
 *  ship's motion, same as a thrown object would). Fast enough to feel like a
 *  weapon, slow enough that its flight across `MINING_RANGE` is genuinely
 *  visible, not instant. */
export const PROJECTILE_SPEED = 220;
/** Collision sphere radius for the traveling bolt itself. */
export const PROJECTILE_RADIUS = 0.12;
/** Lifetime cap (seconds) derived from range/speed — a shot that hasn't hit
 *  anything by the time it could have crossed `MINING_RANGE` expires. */
export const PROJECTILE_MAX_LIFE_SEC = MINING_RANGE / PROJECTILE_SPEED;

const MAX_ASTEROID_RADIUS = Math.max(...TIERS.map((t) => t.max));

const _localOrigin = new Vector3();
const _localDir = new Vector3();
const _toCenter = new Vector3();
const _localHit = new Vector3();

export interface MiningRayHit {
  globalIdx: number;
  /** World-space hit point. */
  point: Vector3;
  distance: number;
}

/**
 * Ray-sphere test against grid-shortlisted asteroid candidates only. `origin`
 * is world-space; `dir` must be a world-space unit vector. Returns the
 * nearest live asteroid hit within `maxDistance`, or null.
 */
export function raycastAsteroids(origin: Vector3, dir: Vector3, maxDistance: number): MiningRayHit | null {
  const grid = asteroidRuntime.grid;
  if (!grid) return null;

  const yaw = asteroidRuntime.groupYaw;
  rotateY(origin, -yaw, _localOrigin);
  rotateY(dir, -yaw, _localDir);

  const candidates = queryNearby(grid, _localOrigin.x, _localOrigin.z, maxDistance + MAX_ASTEROID_RADIUS);

  let best: { idx: number; t: number } | null = null;
  for (const idx of candidates) {
    const s = asteroidRuntime.states[idx];
    if (!s || !s.alive) continue;
    _toCenter.copy(s.pos).sub(_localOrigin);
    const b = _toCenter.dot(_localDir);
    if (b < 0) continue; // asteroid is behind the ray origin
    const perpDistSq = _toCenter.lengthSq() - b * b;
    const r2 = s.radius * s.radius;
    if (perpDistSq > r2) continue; // ray misses the sphere
    const thc = Math.sqrt(r2 - perpDistSq);
    const t = b - thc;
    if (t < 0 || t > maxDistance) continue;
    if (!best || t < best.t) best = { idx, t };
  }
  if (!best) return null;

  _localHit.copy(_localOrigin).addScaledVector(_localDir, best.t);
  const point = new Vector3();
  rotateY(_localHit, yaw, point);
  return { globalIdx: best.idx, point, distance: best.t };
}

// --- Firing input: left mouse (while pointer-locked), Space, or gamepad RB
// (button 5) — none of these are otherwise bound during flight, so mining
// fire never conflicts with the existing thrust/yaw/pitch/roll/fine-control
// bindings in shipInput.ts. ---------------------------------------------

let spaceKeyDown = false;
let mouseDown = false;
let touchFiring = false;
let installed = false;

/** Touch "Fire" button state (TouchControls.tsx) — held true while pressed,
 *  false on release. Separate from the mouse/keyboard/gamepad listeners
 *  below since touch has no equivalent physical event to hook. */
export function setTouchFiring(active: boolean): void {
  touchFiring = active;
}

function onKeyDown(e: KeyboardEvent) {
  if (e.code === 'Space') spaceKeyDown = true;
}
function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') spaceKeyDown = false;
}
function onMouseDown(e: MouseEvent) {
  if (e.button === 0) mouseDown = true;
}
function onMouseUp(e: MouseEvent) {
  if (e.button === 0) mouseDown = false;
}
function onBlur() {
  spaceKeyDown = false;
  mouseDown = false;
  touchFiring = false;
}

export function installMiningInput(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onBlur);
}

export function removeMiningInput(): void {
  installed = false;
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('mousedown', onMouseDown);
  window.removeEventListener('mouseup', onMouseUp);
  window.removeEventListener('blur', onBlur);
  spaceKeyDown = false;
  mouseDown = false;
}

function gamepadFiring(): boolean {
  const pads = navigator.getGamepads?.();
  if (!pads) return false;
  for (const gp of pads) {
    if (gp) return !!gp.buttons[5]?.pressed;
  }
  return false;
}

/** True while any firing input is held (mouse only counts while pointer-locked,
 *  matching the mouse-flight convention). */
export function isFiring(): boolean {
  const mouseFiring = mouseDown && typeof document !== 'undefined' && !!document.pointerLockElement;
  return spaceKeyDown || mouseFiring || gamepadFiring() || touchFiring;
}

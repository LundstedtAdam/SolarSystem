// First-person player physics: an axis-aligned box swept against the voxel grid,
// with per-body gravity, jump, ground friction and a small auto step-up so the
// rolling voxel terrain is walkable. Pure logic (no three scene deps beyond
// Vector3) so the collision can be reasoned about and tested.

import { Vector3 } from 'three';
import type { SurfacePhysics } from './voxelPhysics';

/** Voxel-grid solidity query in world voxel coordinates. */
export type SolidFn = (wx: number, wy: number, wz: number) => boolean;

/** Read-only surface API the ChunkManager hands to the player/controller. */
export interface VoxelApi {
  isSolid: SolidFn;
  /** Block id at a world voxel (0 = air); used for footstep material. */
  blockAt: (wx: number, wy: number, wz: number) => number;
  edit: (wx: number, wy: number, wz: number, blockId: number) => void;
  /** Break the voxel currently under the crosshair. */
  dig: () => void;
}

export interface PlayerInput {
  /** -1..1 strafe (x) and forward (z) in player space. */
  move: { x: number; z: number };
  jump: boolean;
  run: boolean;
}

// Player AABB half-extents (≈0.6 wide, 1.8 tall) and eye height above centre.
const HALF: [number, number, number] = [0.3, 0.9, 0.3];
export const EYE_OFFSET = 0.7;
const STEP_HEIGHT = 1.05;
const EPS = 1e-3;

// --- Minecraft-style slipperiness movement -------------------------------
// Velocity lives in voxels/second; physics steps on a fixed 20 ticks/s grid so
// the multiplicative per-tick friction is frame-rate independent. Each tick:
//   1. accelerate:  vel += dir * GROUND_ACCEL * (REF_SLIP / S)³        (ground)
//   2. integrate:   pos += vel * TICK
//   3. conserve:    vel *= S * SLIP_K   (ground) | AIR_DRAG (air, ignores S)
// High-slip surfaces (ice) accelerate slowly but glide far; low-slip (rock)
// grips hard. Vertical motion is pure ballistic (no drag) so jump arcs are
// perfectly predictable and depend only on gravity.
const TPS = 20;
const TICK = 1 / TPS; // fixed timestep (s)
const MAX_TICKS = 5; // clamp catch-up so a long frame can't spiral
const SPRINT_MULT = 1.6;
/** Per-tick velocity gain on a reference (rock) surface; tuned for ~5.5 vox/s. */
const GROUND_ACCEL = 4.6;
/** Fixed, small air acceleration (independent of surface slipperiness). */
const AIR_ACCEL = 0.6;
/** Minecraft's per-tick friction constant; ground friction = slip * SLIP_K. */
const SLIP_K = 0.91;
/** Reference slipperiness (rock) the acceleration curve is normalized to. */
const REF_SLIP = 0.6;
/** Fixed horizontal air drag — same on every body for predictable jump arcs. */
const AIR_DRAG = 0.91;

const G_EARTH = 22; // base gravity magnitude (voxels/s²)
const JUMP_HEIGHT = 1.25; // apex on Earth gravity (voxels)
// Fixed take-off speed (NOT scaled by gravity), so lower-gravity bodies jump
// higher and hang longer — Moon floaty, Earth normal, Titan light.
const JUMP_SPEED = Math.sqrt(2 * G_EARTH * JUMP_HEIGHT);

const AXIS = ['x', 'y', 'z'] as const;

/** Move `pos` by `disp` on one axis; on collision snap flush to the voxel face
 *  and return true. */
function collide(pos: Vector3, axis: 0 | 1 | 2, disp: number, isSolid: SolidFn): boolean {
  const comp = AXIS[axis];
  pos[comp] += disp;
  const minX = Math.floor(pos.x - HALF[0]);
  const maxX = Math.floor(pos.x + HALF[0]);
  const minY = Math.floor(pos.y - HALF[1]);
  const maxY = Math.floor(pos.y + HALF[1]);
  const minZ = Math.floor(pos.z - HALF[2]);
  const maxZ = Math.floor(pos.z + HALF[2]);
  let hit = false;
  for (let y = minY; y <= maxY && !hit; y++)
    for (let z = minZ; z <= maxZ && !hit; z++)
      for (let x = minX; x <= maxX && !hit; x++) if (isSolid(x, y, z)) hit = true;
  if (!hit) return false;
  const lead = axis === 0 ? maxX : axis === 1 ? maxY : maxZ;
  const trail = axis === 0 ? minX : axis === 1 ? minY : minZ;
  if (disp > 0) pos[comp] = lead - HALF[axis] - EPS;
  else pos[comp] = trail + 1 + HALF[axis] + EPS;
  return true;
}

export class Player {
  readonly pos = new Vector3(); // box centre
  readonly vel = new Vector3();
  onGround = false;
  yaw = 0;
  pitch = 0;
  /** Leftover real time carried between frames so ticks stay fixed-rate. */
  private acc = 0;

  spawnAt(center: Vector3): void {
    this.pos.copy(center);
    this.vel.set(0, 0, 0);
    this.onGround = false;
    this.acc = 0;
  }

  /** Eye position for the camera. */
  eyeY(): number {
    return this.pos.y + EYE_OFFSET;
  }

  /** Step the player by a real frame delta, draining it in fixed ticks. */
  update(dt: number, input: PlayerInput, phys: SurfacePhysics, isSolid: SolidFn): void {
    this.acc += dt;
    let steps = 0;
    while (this.acc >= TICK && steps < MAX_TICKS) {
      this.tick(input, phys, isSolid);
      this.acc -= TICK;
      steps++;
    }
    // Drop any backlog beyond the catch-up cap so a long stall can't fast-forward.
    if (steps >= MAX_TICKS) this.acc = 0;
  }

  /** One fixed-timestep tick of the Minecraft slipperiness model. */
  private tick(input: PlayerInput, phys: SurfacePhysics, isSolid: SolidFn): void {
    const grounded = this.onGround;
    const S = phys.slip;

    // Desired move direction in world space via yaw (unit-clamped input).
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let wx = -sin * input.move.z + cos * input.move.x;
    let wz = -cos * input.move.z - sin * input.move.x;
    const len = Math.hypot(wx, wz);
    if (len > 1) {
      wx /= len;
      wz /= len;
    }

    // Acceleration: on ground it scales by (REF_SLIP / S)³ so grippy surfaces
    // accelerate fast and icy ones slowly; in air it's a small fixed value that
    // ignores the surface entirely.
    const sprint = input.run ? SPRINT_MULT : 1;
    const accelMag = grounded
      ? GROUND_ACCEL * Math.pow(REF_SLIP / S, 3) * phys.speedMul * sprint
      : AIR_ACCEL * phys.speedMul * sprint;
    this.vel.x += wx * accelMag;
    this.vel.z += wz * accelMag;

    // Gravity + jump (pure ballistic vertical; no drag on Y).
    const g = G_EARTH * phys.gravity;
    this.vel.y -= g * TICK;
    if (input.jump && grounded) this.vel.y = JUMP_SPEED;

    // Horizontal move with auto step-up over 1-voxel lips.
    this.moveHorizontal(0, this.vel.x * TICK, isSolid, grounded);
    this.moveHorizontal(2, this.vel.z * TICK, isSolid, grounded);

    // Vertical move; detect ground.
    const vy = this.vel.y * TICK;
    if (vy !== 0 && collide(this.pos, 1, vy, isSolid)) {
      this.onGround = this.vel.y < 0;
      this.vel.y = 0;
    } else {
      this.onGround = false;
    }

    // Conserve momentum for the next tick: ground friction folds in the surface
    // slipperiness; air drag is fixed so jump arcs are identical everywhere.
    const friction = this.onGround ? S * SLIP_K : AIR_DRAG;
    this.vel.x *= friction;
    this.vel.z *= friction;
  }

  private moveHorizontal(axis: 0 | 2, disp: number, isSolid: SolidFn, grounded: boolean): void {
    if (disp === 0) return;
    const comp = AXIS[axis];
    const beforeComp = this.pos[comp];
    const beforeY = this.pos.y;
    if (!collide(this.pos, axis, disp, isSolid)) return; // moved freely

    if (grounded) {
      // Try the same move one step higher (walk up a 1-voxel lip).
      this.pos[comp] = beforeComp;
      this.pos.y = beforeY + STEP_HEIGHT;
      if (!collide(this.pos, axis, disp, isSolid)) return; // stepped up, keep momentum
      this.pos.y = beforeY; // revert the lift
      this.pos[comp] = beforeComp;
      collide(this.pos, axis, disp, isSolid); // re-snap flush at original height
    }
    this.vel[comp] = 0;
  }
}

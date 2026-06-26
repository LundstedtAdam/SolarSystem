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
  edit: (wx: number, wy: number, wz: number, blockId: number) => void;
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

const WALK = 5.5; // voxels/s
const RUN = 9.0;
const ACCEL = 60; // approach rate toward target velocity
const AIR_CONTROL = 0.3;
const G_EARTH = 22; // base gravity magnitude (voxels/s²)
const JUMP_HEIGHT = 1.25; // apex on Earth gravity (voxels)
// Fixed take-off speed (NOT scaled by gravity), so lower-gravity bodies jump
// higher and hang longer — Moon floaty, Earth normal, Titan light.
const JUMP_SPEED = Math.sqrt(2 * G_EARTH * JUMP_HEIGHT);

const AXIS = ['x', 'y', 'z'] as const;

function approach(cur: number, target: number, maxDelta: number): number {
  const d = target - cur;
  if (Math.abs(d) <= maxDelta) return target;
  return cur + Math.sign(d) * maxDelta;
}

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

  spawnAt(center: Vector3): void {
    this.pos.copy(center);
    this.vel.set(0, 0, 0);
    this.onGround = false;
  }

  /** Eye position for the camera. */
  eyeY(): number {
    return this.pos.y + EYE_OFFSET;
  }

  update(dt: number, input: PlayerInput, phys: SurfacePhysics, isSolid: SolidFn): void {
    const grounded = this.onGround;

    // Desired horizontal velocity from input, in world space via yaw.
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let wx = -sin * input.move.z + cos * input.move.x;
    let wz = -cos * input.move.z - sin * input.move.x;
    const len = Math.hypot(wx, wz);
    if (len > 1) {
      wx /= len;
      wz /= len;
    }
    const speed = (input.run ? RUN : WALK) * phys.speedMul;
    const targetX = wx * speed;
    const targetZ = wz * speed;

    const accel = ACCEL * phys.grip * (grounded ? 1 : AIR_CONTROL) * dt;
    this.vel.x = approach(this.vel.x, targetX, accel);
    this.vel.z = approach(this.vel.z, targetZ, accel);

    // Gravity + jump.
    const g = G_EARTH * phys.gravity;
    this.vel.y -= g * dt;
    if (input.jump && grounded) this.vel.y = JUMP_SPEED;

    // Horizontal move with auto step-up over 1-voxel lips.
    this.moveHorizontal(0, this.vel.x * dt, isSolid, grounded);
    this.moveHorizontal(2, this.vel.z * dt, isSolid, grounded);

    // Vertical move; detect ground.
    const vy = this.vel.y * dt;
    if (vy !== 0 && collide(this.pos, 1, vy, isSolid)) {
      this.onGround = this.vel.y < 0;
      this.vel.y = 0;
    } else {
      this.onGround = false;
    }
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

import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Player, type PlayerInput, type SolidFn } from './player';
import type { SurfacePhysics } from './voxelPhysics';

const EARTH: SurfacePhysics = { gravity: 1, slip: 0.6, speedMul: 1 };
const IDLE: PlayerInput = { move: { x: 0, z: 0 }, jump: false, run: false };

/** Flat floor: everything below y = 0 is solid. */
const flatFloor: SolidFn = (_x, y) => y < 0;

/** Step the player as if `seconds` of real time passed at 60 fps. */
function simulate(player: Player, seconds: number, input: PlayerInput, isSolid: SolidFn): void {
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i++) player.update(1 / 60, input, EARTH, isSolid);
}

describe('Player physics', () => {
  it('falls under gravity and lands on the floor', () => {
    const p = new Player();
    p.spawnAt(new Vector3(0.5, 5, 0.5));
    simulate(p, 2, IDLE, flatFloor);
    expect(p.onGround).toBe(true);
    // Feet rest on the floor top (y = 0): box centre = half height above it.
    expect(p.pos.y).toBeGreaterThan(0.85);
    expect(p.pos.y).toBeLessThan(1.0);
  });

  it('jumps to roughly the tuned apex and comes back down', () => {
    const p = new Player();
    p.spawnAt(new Vector3(0.5, 1.5, 0.5));
    simulate(p, 1, IDLE, flatFloor); // settle onto the floor
    const restY = p.pos.y;

    let apex = restY;
    const frames = 90; // 1.5 s covers the full Earth-gravity jump arc
    for (let i = 0; i < frames; i++) {
      // Hold jump across the first few frames — input is sampled per fixed
      // tick (20 Hz), so a single 60 fps frame can fall between ticks.
      p.update(1 / 60, { move: { x: 0, z: 0 }, jump: i < 10, run: false }, EARTH, flatFloor);
      apex = Math.max(apex, p.pos.y);
    }
    // JUMP_HEIGHT is tuned to 1.25 voxels on Earth gravity.
    expect(apex - restY).toBeGreaterThan(1.0);
    expect(apex - restY).toBeLessThan(1.5);
    expect(p.onGround).toBe(true);
    expect(p.pos.y).toBeCloseTo(restY, 1);
  });

  it('is blocked by a wall and zeroes velocity into it', () => {
    const wallAtX2: SolidFn = (x, y) => y < 0 || x >= 2;
    const p = new Player();
    p.spawnAt(new Vector3(0.5, 1.5, 0.5));
    simulate(p, 3, { move: { x: 1, z: 0 }, jump: false, run: false }, wallAtX2);
    // Box half-width is 0.3 — the centre can never pass 2 - 0.3.
    expect(p.pos.x).toBeLessThanOrEqual(2 - 0.3 + 1e-3);
    expect(Math.abs(p.vel.x)).toBeLessThan(1e-6);
  });

  it('auto-steps up a single-voxel lip while walking', () => {
    // Floor below y=0 everywhere, plus a one-voxel-high shelf from x >= 3.
    const shelf: SolidFn = (x, y) => y < 0 || (y === 0 && x >= 3);
    const p = new Player();
    p.spawnAt(new Vector3(0.5, 1.5, 0.5));
    simulate(p, 3, { move: { x: 1, z: 0 }, jump: false, run: false }, shelf);
    // On top of the shelf (top at y = 1): centre ≈ 1.9, i.e. clearly above 1.5.
    expect(p.pos.x).toBeGreaterThan(3);
    expect(p.pos.y).toBeGreaterThan(1.5);
    expect(p.onGround).toBe(true);
  });

  it('never tunnels through the floor on a long frame (catch-up clamp)', () => {
    const p = new Player();
    p.spawnAt(new Vector3(0.5, 30, 0.5));
    // Feed absurd 1-second frames; MAX_TICKS caps each update's catch-up.
    for (let i = 0; i < 60; i++) p.update(1, IDLE, EARTH, flatFloor);
    expect(p.pos.y).toBeGreaterThan(0.8);
  });
});

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

describe('Player water physics (Minecraft-style)', () => {
  // A deep pool: solid floor below y = 0, water filling y = 0..8 (surface at 8).
  const poolSolid: SolidFn = (_x, y) => y < 0;
  const poolLiquid: SolidFn = (_x, y) => y >= 0 && y < 8;

  it('brakes a fall on entry and sinks slowly instead of free-falling', () => {
    const p = new Player();
    p.spawnAt(new Vector3(0.5, 12, 0.5)); // 4 voxels of air above the surface
    for (let i = 0; i < 120; i++) p.update(1 / 60, IDLE, EARTH, poolSolid, poolLiquid); // 2 s
    // Submerged, still descending, but far above the bottom — and at a slow
    // terminal sink speed, not the ~13 vox/s it entered with.
    expect(p.inWater).toBe(true);
    expect(p.pos.y).toBeLessThan(8);
    expect(p.pos.y).toBeGreaterThan(2);
    expect(Math.abs(p.vel.y)).toBeLessThan(2);
    // Eventually rests on the pool floor.
    for (let i = 0; i < 600; i++) p.update(1 / 60, IDLE, EARTH, poolSolid, poolLiquid);
    expect(p.onGround).toBe(true);
    expect(p.pos.y).toBeLessThan(1.0);
  });

  it('swims upward while holding jump', () => {
    const p = new Player();
    p.spawnAt(new Vector3(0.5, 1.5, 0.5));
    const swim: PlayerInput = { move: { x: 0, z: 0 }, jump: true, run: false };
    for (let i = 0; i < 360; i++) p.update(1 / 60, swim, EARTH, poolSolid, poolLiquid); // 6 s
    expect(p.pos.y).toBeGreaterThan(6.5); // rose from the bottom to the surface zone
  });

  it('moves slower through water than over land', () => {
    const run: PlayerInput = { move: { x: 1, z: 0 }, jump: false, run: false };

    const land = new Player();
    land.spawnAt(new Vector3(0.5, 1.5, 0.5));
    for (let i = 0; i < 180; i++) land.update(1 / 60, run, EARTH, flatFloor);

    const wet = new Player();
    wet.spawnAt(new Vector3(0.5, 1.5, 0.5));
    for (let i = 0; i < 180; i++) wet.update(1 / 60, run, EARTH, poolSolid, poolLiquid);

    expect(wet.pos.x).toBeLessThan(land.pos.x * 0.7);
  });
});

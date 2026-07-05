import { beforeEach, describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { updateDebrisBodies } from './debrisPhysics';
import { asteroidRuntime } from '../scene/asteroidRuntime';
import { buildAsteroidGrid } from './asteroidGrid';
import { debrisRuntime, type DebrisBody } from '../scene/debrisRuntime';
import type { AsteroidState } from './asteroidState';
import { PLANETS } from './bodies';
import { positionAtTime } from './ephemeris';

const SIM_TIME = 0;
const mercury = PLANETS.find((p) => p.name === 'Merkurius')!;

function mercuryCenter(): Vector3 {
  const pos = new Vector3();
  positionAtTime(mercury.elements, mercury.distance, SIM_TIME, pos);
  return pos;
}

function mkDebris(pos: Vector3, vel = new Vector3(), radius = 0.3): DebrisBody {
  return { pos, vel, radius, life: 0, isOre: false, quat: new Quaternion(), angVel: new Vector3(), cascadeDepth: 0 };
}

describe('updateDebrisBodies', () => {
  beforeEach(() => {
    asteroidRuntime.states = [];
    asteroidRuntime.grid = null;
    asteroidRuntime.groupYaw = 0;
    debrisRuntime.list = [];
    debrisRuntime.maxCount = 0;
    debrisRuntime.cascadeEnabled = true;
  });

  it('integrates a free-drifting fragment forward each frame', () => {
    const d = mkDebris(new Vector3(0, 0, 0), new Vector3(10, 0, 0));
    const list = [d];
    updateDebrisBodies(list, 1 / 60, SIM_TIME, new Vector3(0, 0, 0), 12, 400);
    expect(list).toHaveLength(1);
    expect(d.pos.x).toBeGreaterThan(0);
  });

  it('expires (removes) a fragment that lives past its lifetime', () => {
    const d = mkDebris(new Vector3(0, 0, 0));
    d.life = 100;
    const list = [d];
    updateDebrisBodies(list, 1 / 60, SIM_TIME, new Vector3(0, 0, 0), 12, 400);
    expect(list).toHaveLength(0);
  });

  it('force-culls a fragment beyond cullDistance from the ship', () => {
    const d = mkDebris(new Vector3(10_000, 0, 0));
    const list = [d];
    updateDebrisBodies(list, 1 / 60, SIM_TIME, new Vector3(0, 0, 0), 12, 400);
    expect(list).toHaveLength(0);
  });

  it('bounces off a planet instead of sticking — velocity reflects, fragment persists', () => {
    const center = mercuryCenter();
    const d = mkDebris(center.clone().add(new Vector3(mercury.size + 0.1, 0, 0)), new Vector3(-5, 0, 0));
    const list = [d];
    updateDebrisBodies(list, 1 / 60, SIM_TIME, new Vector3(0, 0, 0), 12, 4000);
    expect(list).toHaveLength(1);
    expect(d.vel.x).toBeGreaterThan(0); // reflected away from the surface
  });

  it('bounces off an asteroid instead of sticking', () => {
    const state: AsteroidState = {
      tierIdx: 0,
      variantIdx: 0,
      instIdx: 0,
      pos: new Vector3(50, 0, 0),
      vel: new Vector3(),
      radius: 2,
      health: 10,
      maxHealth: 10,
      seed: 0,
      alive: true,
      indestructible: false,
      hitSeq: 0,
      promoted: false,
    };
    asteroidRuntime.states = [state];
    asteroidRuntime.grid = buildAsteroidGrid([state]);
    asteroidRuntime.groupYaw = 0;

    const d = mkDebris(new Vector3(52, 0, 0), new Vector3(-5, 0, 0)); // overlapping, closing on the asteroid
    const list = [d];
    updateDebrisBodies(list, 1 / 60, SIM_TIME, new Vector3(0, 0, 0), 12, 4000);
    expect(list).toHaveLength(1);
    expect(d.vel.x).toBeGreaterThan(0); // reflected away from the surface
  });

  it('bounces apart on debris-vs-debris contact rather than sticking', () => {
    const a = mkDebris(new Vector3(0, 0, 0), new Vector3(1, 0, 0), 1);
    const b = mkDebris(new Vector3(1, 0, 0), new Vector3(-1, 0, 0), 1); // overlapping (radii sum to 2 > distance 1), closing
    const list = [a, b];
    updateDebrisBodies(list, 1 / 60, SIM_TIME, new Vector3(1000, 1000, 1000), 12, 4000);
    expect(list).toHaveLength(2);
    expect(a.vel.x).toBeLessThan(1); // pushed apart, away from its prior closing direction
    expect(b.vel.x).toBeGreaterThan(-1);
  });

  it('caps cascade fracture at one extra level — a cascadeDepth:1 chip never re-fractures', () => {
    // A cascadeDepth:1 body slamming into a planet at very high closing speed
    // must bounce (population growth stays bounded) but never spawn further chips.
    const center = mercuryCenter();
    const d = mkDebris(center.clone().add(new Vector3(mercury.size + 0.1, 0, 0)), new Vector3(-50, 0, 0));
    d.cascadeDepth = 1;
    const list = [d];
    const before = debrisRuntime.list.length;
    updateDebrisBodies(list, 1 / 60, SIM_TIME, new Vector3(0, 0, 0), 12, 4000);
    expect(list).toHaveLength(1);
    expect(debrisRuntime.list.length).toBe(before); // no chips spawned into the pool
  });

  it('chips a hard-enough cascadeDepth:0 impact into secondary fragments', () => {
    const center = mercuryCenter();
    const d = mkDebris(center.clone().add(new Vector3(mercury.size + 0.1, 0, 0)), new Vector3(-50, 0, 0), 1);
    const list = [d];
    debrisRuntime.list = [];
    debrisRuntime.maxCount = 50;
    updateDebrisBodies(list, 1 / 60, SIM_TIME, new Vector3(0, 0, 0), 12, 4000);
    expect(debrisRuntime.list.length).toBeGreaterThan(0);
    expect(debrisRuntime.list.every((c) => c.cascadeDepth === 1)).toBe(true);
    expect(d.radius).toBeLessThan(1); // parent shrank
  });

  it('suppresses cascade chip spawning when cascadeEnabled is off, but still bounces', () => {
    const center = mercuryCenter();
    const d = mkDebris(center.clone().add(new Vector3(mercury.size + 0.1, 0, 0)), new Vector3(-50, 0, 0), 1);
    const list = [d];
    debrisRuntime.list = [];
    debrisRuntime.maxCount = 50;
    debrisRuntime.cascadeEnabled = false;
    updateDebrisBodies(list, 1 / 60, SIM_TIME, new Vector3(0, 0, 0), 12, 4000);
    expect(debrisRuntime.list.length).toBe(0); // no chips
    expect(list).toHaveLength(1);
    expect(d.vel.x).toBeGreaterThan(0); // still reflected, not stuck
    expect(d.radius).toBe(1); // parent didn't shrink (no chip event)
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { updateDebrisBodies } from './debrisPhysics';
import { asteroidRuntime } from '../scene/asteroidRuntime';
import { buildAsteroidGrid } from './asteroidGrid';
import type { DebrisBody } from '../scene/debrisRuntime';
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
  return { pos, vel, radius, life: 0, isOre: false };
}

describe('updateDebrisBodies', () => {
  beforeEach(() => {
    asteroidRuntime.states = [];
    asteroidRuntime.grid = null;
    asteroidRuntime.groupYaw = 0;
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

  it('sticks and expires on planet contact rather than bouncing', () => {
    const center = mercuryCenter();
    const d = mkDebris(center.clone().add(new Vector3(mercury.size + 0.1, 0, 0)), new Vector3(-5, 0, 0));
    const list = [d];
    updateDebrisBodies(list, 1 / 60, SIM_TIME, new Vector3(0, 0, 0), 12, 4000);
    expect(list).toHaveLength(0);
  });

  it('sticks and expires on asteroid contact', () => {
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
    };
    asteroidRuntime.states = [state];
    asteroidRuntime.grid = buildAsteroidGrid([state]);
    asteroidRuntime.groupYaw = 0;

    const d = mkDebris(new Vector3(52, 0, 0)); // overlapping the asteroid (radius 2 + debris 0.3)
    const list = [d];
    updateDebrisBodies(list, 1 / 60, SIM_TIME, new Vector3(0, 0, 0), 12, 4000);
    expect(list).toHaveLength(0);
  });

  it('sticks and expires on debris-vs-debris contact', () => {
    const a = mkDebris(new Vector3(0, 0, 0), new Vector3(), 1);
    const b = mkDebris(new Vector3(1, 0, 0), new Vector3(), 1); // overlapping (radii sum to 2 > distance 1)
    const list = [a, b];
    updateDebrisBodies(list, 1 / 60, SIM_TIME, new Vector3(1000, 1000, 1000), 12, 4000);
    expect(list.length).toBeLessThan(2);
  });
});

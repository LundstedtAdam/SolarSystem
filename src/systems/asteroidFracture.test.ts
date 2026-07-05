import { beforeEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { applyAsteroidDamage } from './asteroidFracture';
import { asteroidRuntime } from '../scene/asteroidRuntime';
import { debrisRuntime } from '../scene/debrisRuntime';
import type { AsteroidState } from './asteroidState';

function mkState(overrides: Partial<AsteroidState> = {}): AsteroidState {
  return {
    tierIdx: 0,
    variantIdx: 0,
    instIdx: 0,
    pos: new Vector3(0, 0, 0),
    radius: 2,
    health: 20,
    maxHealth: 20,
    seed: 42,
    alive: true,
    indestructible: false,
    hitSeq: 0,
    ...overrides,
  };
}

const IMPACT_POINT = new Vector3(1, 0, 0);
const IMPACT_VEL = new Vector3(-10, 0, 0);

describe('applyAsteroidDamage', () => {
  beforeEach(() => {
    asteroidRuntime.states = [];
    asteroidRuntime.grid = null;
    asteroidRuntime.killAsteroid = null;
    debrisRuntime.list = [];
    debrisRuntime.maxCount = 1000;
  });

  it('low-impact damage (health remains) spawns no debris and does not kill', () => {
    const state = mkState({ health: 20, maxHealth: 20 });
    asteroidRuntime.states = [state];
    let killed = false;
    asteroidRuntime.killAsteroid = () => {
      killed = true;
    };

    const result = applyAsteroidDamage(0, 2, IMPACT_POINT, IMPACT_VEL);
    expect(result.tier).toBe('none');
    expect(result.debrisSpawned).toHaveLength(0);
    expect(state.health).toBe(18);
    expect(killed).toBe(false);
    expect(debrisRuntime.list).toHaveLength(0);
  });

  it('a lethal hit with small overkill spawns 1-5 debris (medium tier) and kills the asteroid', () => {
    const state = mkState({ health: 5, maxHealth: 20 }); // small overkill on a 5-damage hit
    asteroidRuntime.states = [state];
    let killedIdx: number | null = null;
    asteroidRuntime.killAsteroid = (idx) => {
      killedIdx = idx;
    };

    const result = applyAsteroidDamage(0, 6, IMPACT_POINT, IMPACT_VEL);
    expect(result.tier).toBe('medium');
    expect(result.debrisSpawned.length).toBeGreaterThanOrEqual(1);
    expect(result.debrisSpawned.length).toBeLessThanOrEqual(5);
    expect(killedIdx).toBe(0);
    expect(debrisRuntime.list.length).toBe(result.debrisSpawned.length);
  });

  it('a lethal hit with large overkill spawns 4-8 debris (high tier)', () => {
    const state = mkState({ health: 5, maxHealth: 20 });
    asteroidRuntime.states = [state];
    asteroidRuntime.killAsteroid = () => {};

    // Overkill = 30 damage past a health of 5 -> way past 0. Overkill fraction
    // = 30/20 = 1.5, well above the 0.6 high-tier threshold.
    const result = applyAsteroidDamage(0, 35, IMPACT_POINT, IMPACT_VEL);
    expect(result.tier).toBe('high');
    expect(result.debrisSpawned.length).toBeGreaterThanOrEqual(4);
    expect(result.debrisSpawned.length).toBeLessThanOrEqual(8);
  });

  it('indestructible asteroids no-op regardless of damage', () => {
    const state = mkState({ health: 1, indestructible: true });
    asteroidRuntime.states = [state];
    let killed = false;
    asteroidRuntime.killAsteroid = () => {
      killed = true;
    };

    const result = applyAsteroidDamage(0, 1000, IMPACT_POINT, IMPACT_VEL);
    expect(result.tier).toBe('none');
    expect(result.debrisSpawned).toHaveLength(0);
    expect(killed).toBe(false);
    expect(state.health).toBe(1); // untouched
  });

  it('already-dead asteroids no-op', () => {
    const state = mkState({ alive: false });
    asteroidRuntime.states = [state];
    const result = applyAsteroidDamage(0, 100, IMPACT_POINT, IMPACT_VEL);
    expect(result.tier).toBe('none');
  });

  it('debris spawn is capped by debrisRuntime.maxCount', () => {
    const state = mkState({ health: 5, maxHealth: 20 });
    asteroidRuntime.states = [state];
    asteroidRuntime.killAsteroid = () => {};
    debrisRuntime.maxCount = 2;

    const result = applyAsteroidDamage(0, 35, IMPACT_POINT, IMPACT_VEL); // high tier, 4-8 fragments
    expect(result.debrisSpawned.length).toBeGreaterThanOrEqual(4);
    expect(debrisRuntime.list.length).toBe(2); // capped even though more were "spawned"
  });
});

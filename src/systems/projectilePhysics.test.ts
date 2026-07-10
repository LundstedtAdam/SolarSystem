import { beforeEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { updateProjectiles } from './projectilePhysics';
import { asteroidRuntime } from '../scene/asteroidRuntime';
import { buildAsteroidGrid } from './asteroidGrid';
import { debrisRuntime } from '../scene/debrisRuntime';
import { miningSparkRuntime } from '../scene/miningSparkRuntime';
import type { ProjectileBody } from '../scene/projectileRuntime';
import type { AsteroidState } from './asteroidState';
import { PLANETS } from './bodies';
import { positionAtTime } from './ephemeris';
import { MINING_RANGE, PROJECTILE_MAX_LIFE_SEC } from '../ship/spaceMining';
import { INNER, OUTER } from './asteroidLayout';

const SIM_TIME = 0;
const mercury = PLANETS.find((p) => p.name === 'Merkurius')!;
// The grid is tuned for the belt's real scale (radius ~1600-1900 units) —
// asteroid-hit tests must place things at a realistic radius, not near the
// world origin, since angle is degenerate at r≈0 and the grid's radial bins
// clamp hard outside the annulus (see spaceMining.test.ts's identical note).
const MID_R = (INNER + OUTER) / 2;
const BELT_ORIGIN = new Vector3(MID_R, 0, 0);

function mercuryCenter(): Vector3 {
  const pos = new Vector3();
  positionAtTime(mercury.elements, mercury.distance, SIM_TIME, pos);
  return pos;
}

function mkProjectile(pos: Vector3, vel: Vector3): ProjectileBody {
  return { pos, vel, life: 0, radius: 0.12 };
}

function mkAsteroidState(pos: Vector3, radius = 2): AsteroidState {
  return {
    tierIdx: 0,
    variantIdx: 0,
    instIdx: 0,
    pos,
    vel: new Vector3(),
    radius,
    health: 10,
    maxHealth: 10,
    seed: 0,
    alive: true,
    indestructible: false,
    hitSeq: 0,
    promoted: false,
  };
}

describe('updateProjectiles', () => {
  beforeEach(() => {
    asteroidRuntime.states = [];
    asteroidRuntime.grid = null;
    asteroidRuntime.groupYaw = 0;
    debrisRuntime.list = [];
    debrisRuntime.maxCount = 50;
    miningSparkRuntime.list = [];
    miningSparkRuntime.maxCount = 50;
  });

  it('integrates a free-flying projectile forward each frame', () => {
    const p = mkProjectile(new Vector3(0, 0, 0), new Vector3(0, 0, -100));
    const list = [p];
    updateProjectiles(list, 1 / 60, SIM_TIME, new Vector3(0, 0, 0), MINING_RANGE);
    expect(list).toHaveLength(1);
    expect(p.pos.z).toBeLessThan(0);
  });

  it('expires once its lifetime (range/speed) is exceeded, with nothing in its path', () => {
    const p = mkProjectile(new Vector3(0, 0, 0), new Vector3(0, 0, -100));
    p.life = PROJECTILE_MAX_LIFE_SEC;
    const list = [p];
    updateProjectiles(list, 1 / 60, SIM_TIME, new Vector3(0, 0, 0), MINING_RANGE);
    expect(list).toHaveLength(0);
  });

  it('force-culls a projectile that ends up far beyond the ship', () => {
    const p = mkProjectile(new Vector3(10_000, 0, 0), new Vector3(0, 0, -1));
    const list = [p];
    updateProjectiles(list, 1 / 60, SIM_TIME, new Vector3(0, 0, 0), MINING_RANGE);
    expect(list).toHaveLength(0);
  });

  it('hits an asteroid its flight segment sweeps through this frame, applies damage, and expires', () => {
    const state = mkAsteroidState(BELT_ORIGIN.clone().add(new Vector3(0, 0, -5)), 2);
    asteroidRuntime.states = [state];
    asteroidRuntime.grid = buildAsteroidGrid([state]);

    // Fast enough that a naive end-point-only test could tunnel past the
    // asteroid within one frame — the swept-segment test must still catch it.
    const p = mkProjectile(BELT_ORIGIN.clone(), new Vector3(0, 0, -600));
    const list = [p];
    updateProjectiles(list, 1 / 60, SIM_TIME, BELT_ORIGIN, MINING_RANGE);

    expect(list).toHaveLength(0); // expired on the connecting hit
    expect(state.health).toBeLessThan(state.maxHealth);
    expect(miningSparkRuntime.list.length).toBeGreaterThan(0);
  });

  it('does not hit an asteroid the flight segment does not pass through', () => {
    const state = mkAsteroidState(BELT_ORIGIN.clone().add(new Vector3(50, 50, -5)), 2); // well off to the side
    asteroidRuntime.states = [state];
    asteroidRuntime.grid = buildAsteroidGrid([state]);

    const p = mkProjectile(BELT_ORIGIN.clone(), new Vector3(0, 0, -100));
    const list = [p];
    updateProjectiles(list, 1 / 60, SIM_TIME, BELT_ORIGIN, MINING_RANGE);

    expect(list).toHaveLength(1);
    expect(state.health).toBe(state.maxHealth);
  });

  it('stops at a planet surface in its path and expires', () => {
    const center = mercuryCenter();
    const p = mkProjectile(center.clone().add(new Vector3(mercury.size + 30, 0, 0)), new Vector3(-600, 0, 0));
    const list = [p];
    // A few frames at this speed easily closes the 30-unit gap to the surface.
    for (let i = 0; i < 10 && list.length > 0; i++) {
      updateProjectiles(list, 1 / 60, SIM_TIME, new Vector3(0, 0, 0), MINING_RANGE);
    }
    expect(list).toHaveLength(0);
  });
});

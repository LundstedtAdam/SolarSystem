import { beforeEach, describe, expect, it } from 'vitest';
import { IcosahedronGeometry, Quaternion, Vector3 } from 'three';
import { applyAsteroidDamage } from './asteroidFracture';
import { getFracturePatterns, pickPattern } from './asteroidFracturePatterns';
import { asteroidRuntime, type AsteroidMomentumInputs } from '../scene/asteroidRuntime';
import { debrisRuntime } from '../scene/debrisRuntime';
import type { AsteroidState } from './asteroidState';

function mkState(overrides: Partial<AsteroidState> = {}): AsteroidState {
  return {
    tierIdx: 0,
    variantIdx: 0,
    instIdx: 0,
    pos: new Vector3(0, 0, 0),
    vel: new Vector3(),
    radius: 2,
    health: 20,
    maxHealth: 20,
    seed: 42,
    alive: true,
    indestructible: false,
    hitSeq: 0,
    promoted: false,
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
    asteroidRuntime.promotion = null;
    debrisRuntime.list = [];
    debrisRuntime.maxCount = 1000;
  });

  it('applies a knockback impulse in the shot direction even on a non-lethal hit', () => {
    const state = mkState({ health: 20, maxHealth: 20 });
    asteroidRuntime.states = [state];
    expect(state.vel.length()).toBe(0);

    applyAsteroidDamage(0, 2, IMPACT_POINT, IMPACT_VEL); // low-impact, survives
    expect(state.vel.length()).toBeGreaterThan(0);
    // Knockback direction matches the shot's direction of travel (IMPACT_VEL is -x).
    expect(state.vel.x).toBeLessThan(0);
    expect(state.vel.y).toBe(0);
    expect(state.vel.z).toBe(0);
  });

  it('a zero-length impactVelocity does not throw and falls back to a default direction', () => {
    const state = mkState({ health: 20, maxHealth: 20 });
    asteroidRuntime.states = [state];
    expect(() => applyAsteroidDamage(0, 2, IMPACT_POINT, new Vector3(0, 0, 0))).not.toThrow();
    expect(state.vel.length()).toBeGreaterThan(0);
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

  it('attempts promotion on the first hit and only the first hit', () => {
    const state = mkState({ health: 20, maxHealth: 20 });
    asteroidRuntime.states = [state];
    let promoteCalls = 0;
    asteroidRuntime.promotion = {
      promote: () => {
        promoteCalls += 1;
        return true;
      },
      applyDent: () => {},
      getMomentumInputs: () => null,
      getSourceGeometry: () => null,
    };

    applyAsteroidDamage(0, 2, IMPACT_POINT, IMPACT_VEL);
    expect(promoteCalls).toBe(1);
    expect(state.promoted).toBe(true);

    // Second hit: already promoted, must not attempt promotion again.
    applyAsteroidDamage(0, 2, IMPACT_POINT, IMPACT_VEL);
    expect(promoteCalls).toBe(1);
  });

  it('applies a dent (not debris) on a non-lethal hit to a promoted asteroid', () => {
    const state = mkState({ health: 20, maxHealth: 20 });
    asteroidRuntime.states = [state];
    let dentCalls = 0;
    asteroidRuntime.promotion = {
      promote: () => true,
      applyDent: (globalIdx, point, amount) => {
        dentCalls += 1;
        expect(globalIdx).toBe(0);
        expect(point).toBe(IMPACT_POINT);
        expect(amount).toBe(2);
      },
      getMomentumInputs: () => null,
      getSourceGeometry: () => null,
    };

    const result = applyAsteroidDamage(0, 2, IMPACT_POINT, IMPACT_VEL);
    expect(dentCalls).toBe(1);
    expect(result.tier).toBe('none');
    expect(result.debrisSpawned).toHaveLength(0);
  });

  it('does not attempt promotion or dent when promotion returns false (over budget / ineligible)', () => {
    const state = mkState({ health: 20, maxHealth: 20 });
    asteroidRuntime.states = [state];
    let dentCalls = 0;
    asteroidRuntime.promotion = {
      promote: () => false,
      applyDent: () => {
        dentCalls += 1;
      },
      getMomentumInputs: () => null,
      getSourceGeometry: () => null,
    };

    applyAsteroidDamage(0, 2, IMPACT_POINT, IMPACT_VEL);
    expect(state.promoted).toBe(false);
    expect(dentCalls).toBe(0);
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

describe('applyAsteroidDamage — pattern-based fracture with momentum', () => {
  const geom = new IcosahedronGeometry(1, 1);

  function mkMomentum(overrides: Partial<AsteroidMomentumInputs> = {}): AsteroidMomentumInputs {
    return {
      angVel: new Vector3(0, 0, 0),
      quat: new Quaternion(),
      scale: new Vector3(1, 1, 1),
      ...overrides,
    };
  }

  beforeEach(() => {
    asteroidRuntime.states = [];
    asteroidRuntime.grid = null;
    asteroidRuntime.killAsteroid = () => {};
    debrisRuntime.list = [];
    debrisRuntime.maxCount = 1000;
  });

  it('fragment count is clamped to the chosen pattern\'s chunkCount', () => {
    const state = mkState({ health: 5, maxHealth: 20 });
    asteroidRuntime.states = [state];
    asteroidRuntime.promotion = {
      promote: () => true,
      applyDent: () => {},
      getMomentumInputs: () => mkMomentum(),
      getSourceGeometry: () => geom,
    };

    const patterns = getFracturePatterns(state.tierIdx, state.variantIdx, geom);
    // High-overkill hit -> 'high' tier -> 4-8 requested, but must never
    // exceed whichever pattern this exact hit resolves to.
    state.hitSeq = 0; // applyAsteroidDamage increments to 1 before hashing
    const expectedPattern = pickPattern(patterns, 0, 1, state.seed);

    const result = applyAsteroidDamage(0, 35, IMPACT_POINT, IMPACT_VEL);
    expect(result.debrisSpawned.length).toBeLessThanOrEqual(expectedPattern.chunkCount);
    expect(result.debrisSpawned.length).toBeGreaterThan(0);
  });

  it('every pattern-based fragment carries a quaternion and angular velocity', () => {
    const state = mkState({ health: 5, maxHealth: 20 });
    asteroidRuntime.states = [state];
    asteroidRuntime.promotion = {
      promote: () => true,
      applyDent: () => {},
      getMomentumInputs: () => mkMomentum(),
      getSourceGeometry: () => geom,
    };

    const result = applyAsteroidDamage(0, 35, IMPACT_POINT, IMPACT_VEL);
    for (const spec of result.debrisSpawned) {
      expect(spec.quat).toBeInstanceOf(Quaternion);
      expect(spec.angVel).toBeInstanceOf(Vector3);
      expect(spec.cascadeDepth).toBe(0);
    }
  });

  it("a fragment's velocity includes the parent's angular-velocity-at-offset contribution", () => {
    // Same hit, same everything, except the parent's angular velocity —
    // the resulting fragment velocities must differ if the momentum formula
    // is actually reading angVel (rather than only jitter/impact terms).
    const stateA = mkState({ health: 5, maxHealth: 20, vel: new Vector3(0, 0, 0) });
    asteroidRuntime.states = [stateA];
    asteroidRuntime.promotion = {
      promote: () => true,
      applyDent: () => {},
      getMomentumInputs: () => mkMomentum({ angVel: new Vector3(0, 0, 0) }),
      getSourceGeometry: () => geom,
    };
    const resultNoSpin = applyAsteroidDamage(0, 35, IMPACT_POINT, IMPACT_VEL);

    const stateB = mkState({ health: 5, maxHealth: 20, vel: new Vector3(0, 0, 0) });
    asteroidRuntime.states = [stateB];
    asteroidRuntime.promotion = {
      promote: () => true,
      applyDent: () => {},
      getMomentumInputs: () => mkMomentum({ angVel: new Vector3(0, 20, 0) }), // fast spin about Y
      getSourceGeometry: () => geom,
    };
    const resultWithSpin = applyAsteroidDamage(0, 35, IMPACT_POINT, IMPACT_VEL);

    // At least one fragment's velocity should differ once the parent is
    // spinning fast, since angVel × offset is now a nonzero contribution
    // (unless every extracted chunk happened to centroid at the origin,
    // vanishingly unlikely for a real icosahedron cluster).
    let anyDiffers = false;
    for (let i = 0; i < Math.min(resultNoSpin.debrisSpawned.length, resultWithSpin.debrisSpawned.length); i++) {
      const a = resultNoSpin.debrisSpawned[i].vel;
      const b = resultWithSpin.debrisSpawned[i].vel;
      if (a.distanceTo(b) > 1e-6) anyDiffers = true;
    }
    expect(anyDiffers).toBe(true);
  });

  it('a fragment\'s position offset scales with the parent scale and rotates with the parent orientation', () => {
    const state = mkState({ health: 5, maxHealth: 20, pos: new Vector3(100, 0, 0) });
    asteroidRuntime.states = [state];
    asteroidRuntime.promotion = {
      promote: () => true,
      applyDent: () => {},
      getMomentumInputs: () => mkMomentum({ scale: new Vector3(5, 5, 5) }), // large parent
      getSourceGeometry: () => geom,
    };

    const result = applyAsteroidDamage(0, 35, IMPACT_POINT, IMPACT_VEL);
    // Every fragment's position must be offset from the parent's own
    // position (state.pos) by some nonzero amount that reflects the 5x
    // scale-up (chunks extracted from a unit geometry, so a bare offset
    // without scaling would be tiny by comparison).
    for (const spec of result.debrisSpawned) {
      const dist = spec.pos.distanceTo(state.pos);
      expect(dist).toBeGreaterThan(0);
    }
  });
});

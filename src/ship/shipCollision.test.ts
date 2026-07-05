import { beforeEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { resolvePlanetCollision, resolveAsteroidCollision, TANGENTIAL_RETAIN } from './shipCollision';
import { PLANETS } from '../systems/bodies';
import { positionAtTime } from '../systems/ephemeris';
import { asteroidRuntime } from '../scene/asteroidRuntime';
import { buildAsteroidGrid } from '../systems/asteroidGrid';
import type { AsteroidState } from '../systems/asteroidState';

// Mercury has no moons — simplest body to test sphere-vs-sphere resolution
// against without moon-offset interference.
const mercury = PLANETS.find((p) => p.name === 'Merkurius')!;
const SIM_TIME = 0;
const SHIP_RADIUS = 0.6;

function mercuryCenter(): Vector3 {
  const pos = new Vector3();
  positionAtTime(mercury.elements, mercury.distance, SIM_TIME, pos);
  return pos;
}

describe('resolvePlanetCollision', () => {
  it('does nothing when the ship is far from every body', () => {
    const center = mercuryCenter();
    const position = center.clone().add(new Vector3(10_000, 0, 0));
    const velocity = new Vector3(-5, 0, 0);
    const hit = resolvePlanetCollision(position, velocity.clone(), SIM_TIME, SHIP_RADIUS);
    expect(hit).toBe(false);
    expect(velocity.equals(new Vector3(-5, 0, 0))).toBe(true);
  });

  it('pushes the ship out to the surface + skin when penetrating', () => {
    const center = mercuryCenter();
    // Place the ship dead center inside the planet, along +x from center.
    const position = center.clone().add(new Vector3(1, 0, 0));
    const velocity = new Vector3(-3, 0, 0);
    const hit = resolvePlanetCollision(position, velocity, SIM_TIME, SHIP_RADIUS);
    expect(hit).toBe(true);
    const dist = position.distanceTo(center);
    expect(dist).toBeCloseTo(mercury.size + SHIP_RADIUS + 0.05, 5);
  });

  it('zeros the into-surface velocity component and retains tangential component', () => {
    const center = mercuryCenter();
    // Approach along +x (normal), moving purely inward (-x) and purely
    // tangential (+y) — normal component should vanish, tangential retained.
    const position = center.clone().add(new Vector3(mercury.size + SHIP_RADIUS - 0.5, 0, 0));
    const velocity = new Vector3(-10, 4, 0);
    resolvePlanetCollision(position, velocity, SIM_TIME, SHIP_RADIUS);

    const normal = position.clone().sub(center).normalize();
    const normalSpeed = velocity.dot(normal);
    expect(normalSpeed).toBeCloseTo(0, 5);
    expect(velocity.y).toBeCloseTo(4 * TANGENTIAL_RETAIN, 5);
  });

  it('does not correct a ship moving away from the surface it is grazing', () => {
    const center = mercuryCenter();
    const position = center.clone().add(new Vector3(mercury.size + SHIP_RADIUS - 0.5, 0, 0));
    const velocity = new Vector3(10, 0, 0); // moving outward, away from center
    resolvePlanetCollision(position, velocity, SIM_TIME, SHIP_RADIUS);
    // Position still gets pushed to the surface (it's penetrating), but the
    // outward velocity must be left untouched since it isn't driving further
    // penetration.
    expect(velocity.x).toBeCloseTo(10, 5);
  });
});

function mkState(x: number, z: number): AsteroidState {
  return {
    tierIdx: 0,
    variantIdx: 0,
    instIdx: 0,
    pos: new Vector3(x, 0, z),
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
}

describe('resolveAsteroidCollision', () => {
  beforeEach(() => {
    asteroidRuntime.states = [];
    asteroidRuntime.grid = null;
    asteroidRuntime.groupYaw = 0;
    asteroidRuntime.killAsteroid = null;
  });

  it('returns null when there is no belt mounted (grid is null)', () => {
    const position = new Vector3(0, 0, 0);
    const velocity = new Vector3(-1, 0, 0);
    expect(resolveAsteroidCollision(position, velocity, SHIP_RADIUS)).toBeNull();
  });

  it('detects and resolves a contact in belt-local (unrotated) space', () => {
    const states = [mkState(10, 0)];
    asteroidRuntime.states = states;
    asteroidRuntime.grid = buildAsteroidGrid(states);
    asteroidRuntime.groupYaw = 0;

    const position = new Vector3(10 + 2 + SHIP_RADIUS - 0.5, 0, 0); // penetrating
    const velocity = new Vector3(-5, 0, 0);
    const hit = resolveAsteroidCollision(position, velocity, SHIP_RADIUS);

    expect(hit).not.toBeNull();
    expect(hit!.globalIdx).toBe(0);
    expect(hit!.closingSpeed).toBeCloseTo(5, 5);
    expect(position.distanceTo(states[0].pos)).toBeCloseTo(2 + SHIP_RADIUS + 0.05, 5);
  });

  it('accounts for the belt group yaw when querying/resolving', () => {
    const states = [mkState(10, 0)]; // belt-local position
    asteroidRuntime.states = states;
    asteroidRuntime.grid = buildAsteroidGrid(states);
    const yaw = Math.PI / 2; // belt rotated 90° in world space
    asteroidRuntime.groupYaw = yaw;

    // World position of the same asteroid after a +90° belt rotation: (x,z) -> (x*cos+z*sin, -x*sin+z*cos)...
    // rotateY(local, yaw, world) in shipCollision.ts uses world = R(yaw) * local convention below.
    const worldAsteroidX = 10 * Math.cos(yaw);
    const worldAsteroidZ = -10 * Math.sin(yaw);
    const position = new Vector3(worldAsteroidX, 0, worldAsteroidZ).setLength(
      new Vector3(worldAsteroidX, 0, worldAsteroidZ).length() - (2 + SHIP_RADIUS - 0.5),
    );
    const velocity = new Vector3(worldAsteroidX, 0, worldAsteroidZ).normalize().multiplyScalar(5);

    const hit = resolveAsteroidCollision(position, velocity, SHIP_RADIUS);
    expect(hit).not.toBeNull();
    expect(hit!.globalIdx).toBe(0);
  });

  it('ignores dead asteroids', () => {
    const states = [{ ...mkState(10, 0), alive: false }];
    asteroidRuntime.states = states;
    asteroidRuntime.grid = buildAsteroidGrid(states);
    const position = new Vector3(10 + 2 + SHIP_RADIUS - 0.5, 0, 0);
    const velocity = new Vector3(-5, 0, 0);
    expect(resolveAsteroidCollision(position, velocity, SHIP_RADIUS)).toBeNull();
  });
});

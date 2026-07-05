import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { raycastAsteroids, isFiring, setTouchFiring, installMiningInput, removeMiningInput } from './spaceMining';
import { rotateY } from './shipCollision';
import { asteroidRuntime } from '../scene/asteroidRuntime';
import { buildAsteroidGrid } from '../systems/asteroidGrid';
import { INNER, OUTER } from '../systems/asteroidLayout';
import type { AsteroidState } from '../systems/asteroidState';

// The grid is tuned for the belt's real scale (radius ~1600-1900 units) —
// tests must place asteroids at a realistic radius, not near the world
// origin, since angle is degenerate at r≈0 and the grid's radial bins clamp
// hard outside the annulus.
const MID_R = (INNER + OUTER) / 2;
const ORIGIN = new Vector3(MID_R, 0, 0);

function mkState(pos: Vector3, radius = 2): AsteroidState {
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
  };
}

describe('raycastAsteroids', () => {
  beforeEach(() => {
    asteroidRuntime.states = [];
    asteroidRuntime.grid = null;
    asteroidRuntime.groupYaw = 0;
  });

  it('returns null when no belt is mounted', () => {
    expect(raycastAsteroids(ORIGIN.clone(), new Vector3(0, 0, -1), 60)).toBeNull();
  });

  it('hits an asteroid directly ahead of the ray', () => {
    const state = mkState(ORIGIN.clone().add(new Vector3(0, 0, -20)));
    asteroidRuntime.states = [state];
    asteroidRuntime.grid = buildAsteroidGrid([state]);

    const hit = raycastAsteroids(ORIGIN.clone(), new Vector3(0, 0, -1), 60);
    expect(hit).not.toBeNull();
    expect(hit!.globalIdx).toBe(0);
    expect(hit!.distance).toBeCloseTo(18, 5); // 20 - radius 2
  });

  it('misses an asteroid the ray does not point at', () => {
    const state = mkState(ORIGIN.clone().add(new Vector3(20, 5, 0))); // off to the side
    asteroidRuntime.states = [state];
    asteroidRuntime.grid = buildAsteroidGrid([state]);

    const hit = raycastAsteroids(ORIGIN.clone(), new Vector3(0, 0, -1), 60);
    expect(hit).toBeNull();
  });

  it('does not hit something beyond maxDistance', () => {
    const state = mkState(ORIGIN.clone().add(new Vector3(0, 0, -100)));
    asteroidRuntime.states = [state];
    asteroidRuntime.grid = buildAsteroidGrid([state]);

    const hit = raycastAsteroids(ORIGIN.clone(), new Vector3(0, 0, -1), 60);
    expect(hit).toBeNull();
  });

  it('ignores dead asteroids', () => {
    const state = { ...mkState(ORIGIN.clone().add(new Vector3(0, 0, -20))), alive: false };
    asteroidRuntime.states = [state];
    asteroidRuntime.grid = buildAsteroidGrid([state]);

    expect(raycastAsteroids(ORIGIN.clone(), new Vector3(0, 0, -1), 60)).toBeNull();
  });

  it('picks the nearest of several candidates along the ray', () => {
    const near = mkState(ORIGIN.clone().add(new Vector3(0, 0, -20)));
    const far = mkState(ORIGIN.clone().add(new Vector3(0, 0, -40)));
    asteroidRuntime.states = [near, far];
    asteroidRuntime.grid = buildAsteroidGrid([near, far]);

    const hit = raycastAsteroids(ORIGIN.clone(), new Vector3(0, 0, -1), 60);
    expect(hit!.globalIdx).toBe(0);
  });

  it('accounts for belt group yaw', () => {
    const yaw = Math.PI / 4;
    // The asteroid's stored position is always belt-local, and so is the
    // ship's position once translated into that frame (undoing the belt's
    // rotation) — that's what the grid query actually operates on. Placing
    // the asteroid 20 local units from the ship's *local* position (not its
    // world position) is what makes this a realistic same-neighborhood case.
    const localOrigin = new Vector3();
    rotateY(ORIGIN, -yaw, localOrigin);
    const localAsteroidPos = localOrigin.clone().add(new Vector3(0, 0, -20));

    const state = mkState(localAsteroidPos);
    asteroidRuntime.states = [state];
    asteroidRuntime.grid = buildAsteroidGrid([state]);
    asteroidRuntime.groupYaw = yaw;

    const worldAsteroidPos = new Vector3();
    rotateY(localAsteroidPos, yaw, worldAsteroidPos);
    const dir = worldAsteroidPos.clone().sub(ORIGIN).normalize();
    const hit = raycastAsteroids(ORIGIN.clone(), dir, 60);
    expect(hit).not.toBeNull();
    expect(hit!.globalIdx).toBe(0);
  });
});

describe('isFiring / setTouchFiring', () => {
  afterEach(() => {
    setTouchFiring(false);
    removeMiningInput();
  });

  it('is false when nothing is held', () => {
    installMiningInput();
    expect(isFiring()).toBe(false);
  });

  it('is true while the touch fire button is held (regression: touch previously had no way to fire at all)', () => {
    installMiningInput();
    setTouchFiring(true);
    expect(isFiring()).toBe(true);
  });

  it('returns to false once the touch fire button is released', () => {
    installMiningInput();
    setTouchFiring(true);
    expect(isFiring()).toBe(true);
    setTouchFiring(false);
    expect(isFiring()).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { resolvePlanetCollision, TANGENTIAL_RETAIN } from './shipCollision';
import { PLANETS } from '../systems/bodies';
import { positionAtTime } from '../systems/ephemeris';

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

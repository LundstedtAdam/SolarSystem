import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { buildAsteroidGrid, queryNearby, removeFromGrid, insertIntoGrid, RADIAL_CELL } from './asteroidGrid';
import type { AsteroidState } from './asteroidState';
import { INNER, OUTER } from './asteroidLayout';

function mkState(x: number, z: number, alive = true): AsteroidState {
  return {
    tierIdx: 0,
    variantIdx: 0,
    instIdx: 0,
    pos: new Vector3(x, 0, z),
    radius: 1,
    health: 10,
    maxHealth: 10,
    seed: 0,
    alive,
    indestructible: false,
    hitSeq: 0,
  };
}

const MID_R = (INNER + OUTER) / 2;

describe('asteroidGrid', () => {
  it('finds a nearby asteroid via queryNearby', () => {
    const states = [mkState(MID_R, 0)];
    const grid = buildAsteroidGrid(states);
    const candidates = queryNearby(grid, MID_R, 0, RADIAL_CELL);
    expect(candidates).toContain(0);
  });

  it('does not return an asteroid far outside the query radius/ring', () => {
    const states = [mkState(MID_R, 0), mkState(MID_R + 500, 0)];
    const grid = buildAsteroidGrid(states);
    const candidates = queryNearby(grid, MID_R, 0, RADIAL_CELL);
    expect(candidates).toContain(0);
    expect(candidates).not.toContain(1);
  });

  it('handles angular wraparound at 0/2π', () => {
    // One asteroid just past angle 0, one just before 2π — should be
    // neighbors in angle-space despite being far apart numerically.
    const nearZero = new Vector3(MID_R * Math.cos(0.001), 0, MID_R * Math.sin(0.001));
    const nearTwoPi = new Vector3(
      MID_R * Math.cos(Math.PI * 2 - 0.001),
      0,
      MID_R * Math.sin(Math.PI * 2 - 0.001),
    );
    const states = [
      { ...mkState(0, 0), pos: nearZero },
      { ...mkState(0, 0), pos: nearTwoPi },
    ];
    const grid = buildAsteroidGrid(states);
    const candidates = queryNearby(grid, nearZero.x, nearZero.z, RADIAL_CELL);
    expect(candidates).toContain(0);
    expect(candidates).toContain(1);
  });

  it('excludes dead asteroids from the built grid', () => {
    const states = [mkState(MID_R, 0, false)];
    const grid = buildAsteroidGrid(states);
    const candidates = queryNearby(grid, MID_R, 0, RADIAL_CELL);
    expect(candidates).not.toContain(0);
  });

  it('removeFromGrid/insertIntoGrid update membership', () => {
    const states = [mkState(MID_R, 0)];
    const grid = buildAsteroidGrid(states);
    expect(queryNearby(grid, MID_R, 0, RADIAL_CELL)).toContain(0);

    removeFromGrid(grid, 0, MID_R, 0);
    expect(queryNearby(grid, MID_R, 0, RADIAL_CELL)).not.toContain(0);

    insertIntoGrid(grid, 0, MID_R, 0);
    expect(queryNearby(grid, MID_R, 0, RADIAL_CELL)).toContain(0);
  });

  it('returns nothing when queried far outside the annulus', () => {
    const states = [mkState(MID_R, 0)];
    const grid = buildAsteroidGrid(states);
    const candidates = queryNearby(grid, 0, 0, RADIAL_CELL); // center of the sun, well inside INNER
    expect(candidates).not.toContain(0);
  });
});

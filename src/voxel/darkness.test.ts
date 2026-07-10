import { describe, expect, it } from 'vitest';
import { ambientDarknessFactor, CAVE_FLOOR, DARK_BODY_FLOOR, DARK_BODY_AMBIENT_THRESHOLD } from './darkness';

describe('ambientDarknessFactor', () => {
  it('is 1 (no dimming) on a bright body at the surface', () => {
    expect(ambientDarknessFactor(1.1, 0)).toBe(1);
  });

  it('dims by CAVE_FLOOR at full cave depth on a bright body', () => {
    expect(ambientDarknessFactor(1.1, 1)).toBeCloseTo(CAVE_FLOOR, 5);
  });

  it('interpolates smoothly between cave = 0 and cave = 1', () => {
    const half = ambientDarknessFactor(1.1, 0.5);
    expect(half).toBeGreaterThan(CAVE_FLOOR);
    expect(half).toBeLessThan(1);
  });

  it('clamps cave outside [0,1]', () => {
    expect(ambientDarknessFactor(1.1, -5)).toBe(1);
    expect(ambientDarknessFactor(1.1, 5)).toBeCloseTo(CAVE_FLOOR, 5);
  });

  it('applies the dark-body floor at the surface for a low-ambient (airless/moon) archetype', () => {
    expect(ambientDarknessFactor(0.28, 0)).toBeCloseTo(DARK_BODY_FLOOR, 5);
  });

  it('does not apply the dark-body floor exactly at the threshold', () => {
    expect(ambientDarknessFactor(DARK_BODY_AMBIENT_THRESHOLD, 0)).toBe(1);
  });

  it('compounds both factors — a dark body in a cave is darker than either factor alone', () => {
    const both = ambientDarknessFactor(0.28, 1);
    expect(both).toBeCloseTo(DARK_BODY_FLOOR * CAVE_FLOOR, 5);
    expect(both).toBeLessThan(DARK_BODY_FLOOR);
    expect(both).toBeLessThan(CAVE_FLOOR);
  });
});

import { describe, expect, it } from 'vitest';
import { buildAsteroidStates } from './asteroidState';
import { computeTierVariantCounts } from './asteroidLayout';

describe('buildAsteroidStates', () => {
  it('produces exactly as many states as computeTierVariantCounts implies', () => {
    const count = 500;
    const groups = computeTierVariantCounts(count);
    const expectedTotal = groups.reduce((sum, g) => sum + g.n, 0);
    const states = buildAsteroidStates(count);
    expect(states.length).toBe(expectedTotal);
  });

  it('all built states start alive, non-indestructible, at full health', () => {
    const states = buildAsteroidStates(100);
    for (const s of states) {
      expect(s.alive).toBe(true);
      expect(s.indestructible).toBe(false);
      expect(s.health).toBe(s.maxHealth);
    }
  });

  it('bigger asteroids (larger radius) have more max health', () => {
    const states = buildAsteroidStates(2000);
    const sorted = [...states].sort((a, b) => a.radius - b.radius);
    const smallest = sorted[0];
    const largest = sorted[sorted.length - 1];
    expect(largest.maxHealth).toBeGreaterThan(smallest.maxHealth);
  });

  it('is deterministic across repeated calls with the same seed', () => {
    const a = buildAsteroidStates(200);
    const b = buildAsteroidStates(200);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].pos.equals(b[i].pos)).toBe(true);
      expect(a[i].maxHealth).toBe(b[i].maxHealth);
    }
  });
});

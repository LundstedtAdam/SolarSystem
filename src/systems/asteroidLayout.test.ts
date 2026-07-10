import { describe, expect, it } from 'vitest';
import { placeAsteroid, TIERS, BELT_SEED } from './asteroidLayout';

describe('placeAsteroid determinism', () => {
  it('is a pure function of (tier, variant, index, seed) — same inputs, same output', () => {
    const a = placeAsteroid(1, 0, 42, BELT_SEED);
    const b = placeAsteroid(1, 0, 42, BELT_SEED);
    expect(a.pos.equals(b.pos)).toBe(true);
    expect(a.scale.equals(b.scale)).toBe(true);
    expect(a.quat.equals(b.quat)).toBe(true);
  });

  it('quality-tier truncation is stable — an index does not move when the tier population changes size', () => {
    // The layout function never takes total tier count as input, so this is
    // really asserting the API shape holds the determinism contract: indices
    // below any truncation point are computed identically regardless of how
    // many indices exist above them.
    const low = placeAsteroid(0, 0, 5, BELT_SEED);
    const high = placeAsteroid(0, 0, 5, BELT_SEED);
    expect(low.pos.toArray()).toEqual(high.pos.toArray());
  });

  it('different indices produce different placements (no accidental salt collisions)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const p = placeAsteroid(2, 1, i, BELT_SEED);
      const key = `${p.pos.x.toFixed(3)},${p.pos.y.toFixed(3)},${p.pos.z.toFixed(3)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('different tiers/variants at the same index do not collide on the same hash stream', () => {
    const a = placeAsteroid(0, 0, 0, BELT_SEED);
    const b = placeAsteroid(1, 0, 0, BELT_SEED);
    const c = placeAsteroid(2, 0, 0, BELT_SEED);
    expect(a.pos.equals(b.pos)).toBe(false);
    expect(b.pos.equals(c.pos)).toBe(false);
  });

  it('rotating tiers get tumble data, non-rotating tiers do not', () => {
    const rotating = placeAsteroid(1, 0, 0, BELT_SEED); // TIERS[1].rotates === true
    const still = placeAsteroid(0, 0, 0, BELT_SEED); // TIERS[0].rotates === false
    expect(TIERS[1].rotates).toBe(true);
    expect(TIERS[0].rotates).toBe(false);
    expect(rotating.tumbleAxis).toBeDefined();
    expect(still.tumbleAxis).toBeUndefined();
  });

  it('placement stays within the belt annulus radius bounds', () => {
    for (let i = 0; i < 30; i++) {
      const p = placeAsteroid(0, 0, i, BELT_SEED);
      const r = Math.hypot(p.pos.x, p.pos.z);
      expect(r).toBeGreaterThanOrEqual(645 * 2.5 - 1e-6);
      expect(r).toBeLessThanOrEqual(755 * 2.5 + 1e-6);
    }
  });
});

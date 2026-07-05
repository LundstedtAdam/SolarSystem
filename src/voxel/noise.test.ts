import { describe, expect, it } from 'vitest';
import { fbm3 } from './noise';

// World Richness Phase 4: fbm3 is the 3D analogue of the existing fbm2,
// added for richer cave-carving noise. Same contract: deterministic,
// normalized to [0,1] regardless of octave count.
describe('fbm3', () => {
  it('is deterministic for a fixed seed and position', () => {
    const a = fbm3(1.5, 2.5, 3.5, 99, 3);
    const b = fbm3(1.5, 2.5, 3.5, 99, 3);
    expect(a).toBe(b);
  });

  it('stays normalized to [0,1] across octave counts', () => {
    for (let octaves = 1; octaves <= 5; octaves++) {
      for (let i = 0; i < 20; i++) {
        const v = fbm3(i * 0.37, i * 1.1, i * 2.3, 7, octaves);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('varies with position (not a constant field)', () => {
    const samples = new Set<number>();
    for (let i = 0; i < 10; i++) samples.add(fbm3(i * 3.1, i * 1.7, i * 0.9, 5, 3));
    expect(samples.size).toBeGreaterThan(1);
  });
});

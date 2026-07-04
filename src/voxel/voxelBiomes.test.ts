import { describe, expect, it } from 'vitest';
import { latitudeOf, LATITUDE_SPAN } from './voxelBiomes';

// World Richness Phase 5: latitudeOf is the shared flat-world latitude proxy
// used by both the polar colour blend (voxelMaterial.ts, GPU-side) and the
// ground-clutter density falloff (VoxelScatter.tsx, CPU-side) — they must
// agree on where "polar" starts, so this pure function is the single source
// of truth for both.
describe('latitudeOf', () => {
  it('is 0 at the equator (world Z=0)', () => {
    expect(latitudeOf(0)).toBe(0);
  });

  it('is 1 at and beyond the pole span, symmetric in both directions', () => {
    expect(latitudeOf(LATITUDE_SPAN)).toBe(1);
    expect(latitudeOf(-LATITUDE_SPAN)).toBe(1);
    expect(latitudeOf(LATITUDE_SPAN * 10)).toBe(1); // never exceeds 1
  });

  it('increases monotonically with distance from the equator', () => {
    const a = latitudeOf(LATITUDE_SPAN * 0.2);
    const b = latitudeOf(LATITUDE_SPAN * 0.5);
    const c = latitudeOf(LATITUDE_SPAN * 0.8);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
});

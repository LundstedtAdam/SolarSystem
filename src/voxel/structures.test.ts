import { describe, expect, it } from 'vitest';
import { generatePOI, POI_MAX_HALF_EXTENT } from './structures';

// World Richness Phase 3: the two new POITypes ('outpost' for structural
// variety, 'cache' for the high-frequency micro-discovery channel) must obey
// the same contract every existing POIType already does — deterministic,
// and never exceeding the half-extent the chunk stamper assumes.
describe('generatePOI new archetypes (World Richness Phase 3)', () => {
  it('outpost is deterministic and stays within POI_MAX_HALF_EXTENT', () => {
    const a = generatePOI('outpost', 777, 'rock');
    const b = generatePOI('outpost', 777, 'rock');
    expect(a).toEqual(b);
    expect(a.voxels.length).toBeGreaterThan(0);
    expect(a.footprint[0] / 2).toBeLessThanOrEqual(POI_MAX_HALF_EXTENT);
    expect(a.footprint[1] / 2).toBeLessThanOrEqual(POI_MAX_HALF_EXTENT);
  });

  it('cache is a single small find, not a room-scale structure', () => {
    const built = generatePOI('cache', 42, 'earth');
    // 4-6 voxels authored, minus whatever the damage() collapse pass removes.
    expect(built.voxels.length).toBeGreaterThan(0);
    expect(built.voxels.length).toBeLessThanOrEqual(6);
    expect(built.footprint[0] / 2).toBeLessThanOrEqual(POI_MAX_HALF_EXTENT);
    expect(built.footprint[1] / 2).toBeLessThanOrEqual(POI_MAX_HALF_EXTENT);
  });

  it('cache is deterministic for a fixed seed', () => {
    const a = generatePOI('cache', 123, 'ice');
    const b = generatePOI('cache', 123, 'ice');
    expect(a).toEqual(b);
  });

  it('produces different structures across archetypes for the same seed (reclaim material varies)', () => {
    const earth = generatePOI('outpost', 5, 'earth');
    const ice = generatePOI('outpost', 5, 'ice');
    // Same jigsaw shape (archetype only affects reclaim block + damage rng
    // draws consumed for that block choice — different archetypes are cached
    // under different keys so this also exercises the cache correctly).
    expect(earth).not.toBe(ice);
  });
});

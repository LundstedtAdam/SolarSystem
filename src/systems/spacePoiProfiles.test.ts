import { describe, expect, it } from 'vitest';
import { SPACE_POIS, isAnchoredPoi } from './spacePoiProfiles';
import { computeTierVariantCounts } from './asteroidLayout';
import { QUALITY } from './quality';

describe('spacePoiProfiles', () => {
  it('has at least one of each POI kind, demonstrating the full system', () => {
    const kinds = new Set(SPACE_POIS.map((s) => s.kind));
    expect(kinds.has('wreckage')).toBe(true);
    expect(kinds.has('anomaly')).toBe(true);
    expect(kinds.has('resourceCluster')).toBe(true);
    expect(kinds.has('landmark')).toBe(true);
  });

  it('every POI id is unique', () => {
    const ids = SPACE_POIS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('isAnchoredPoi correctly discriminates fixed vs anchored specs', () => {
    for (const spec of SPACE_POIS) {
      if (isAnchoredPoi(spec)) {
        expect('anchorGlobalIdx' in spec).toBe(true);
      } else {
        expect('pos' in spec).toBe(true);
      }
    }
  });

  it('every anchored POI index resolves within the belt at every non-zero quality tier', () => {
    const anchored = SPACE_POIS.filter(isAnchoredPoi);
    expect(anchored.length).toBeGreaterThan(0);
    for (const tierName of ['medium', 'high', 'ultra'] as const) {
      const count = QUALITY[tierName].asteroids;
      const groups = computeTierVariantCounts(count);
      const total = groups.reduce((sum, g) => sum + g.n, 0);
      for (const spec of anchored) {
        expect(spec.anchorGlobalIdx).toBeLessThan(total);
      }
    }
  });
});

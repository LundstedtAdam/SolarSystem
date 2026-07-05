import { describe, expect, it } from 'vitest';
import { getWildlife } from './wildlifeProfiles';

// World Richness Phase 8: wildlife follows the exact same narrative gate as
// ground-clutter flora (Phase 2) and trees (Phase 7) — real fauna only on
// Earth, sparse ambiguous drifters only on bodies whose life question is
// still open, nothing anywhere else.
describe('getWildlife narrative gating', () => {
  it('gives Earth real birds + critters', () => {
    const profiles = getWildlife('Jorden');
    expect(profiles.map((p) => p.species.kind).sort()).toEqual(['bird', 'critter']);
  });

  it('gives a not_detected body no wildlife at all', () => {
    // Merkurius: scienceNotes.lifeStatus === 'not_detected'.
    expect(getWildlife('Merkurius')).toHaveLength(0);
  });

  it('gives a theoretical/inconclusive body a sparse ambiguous drifter layer', () => {
    // Mars: scienceNotes.lifeStatus === 'theoretical'.
    const profiles = getWildlife('Mars');
    expect(profiles).toHaveLength(1);
    expect(profiles[0].species.kind).toBe('drifter');
    // Deliberately sparser than Earth's fauna.
    const earthDensity = Math.max(...getWildlife('Jorden').map((p) => p.density));
    expect(profiles[0].density).toBeLessThan(earthDensity);
  });
});

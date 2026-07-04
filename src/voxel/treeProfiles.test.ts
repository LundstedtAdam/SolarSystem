import { describe, expect, it } from 'vitest';
import { getTrees } from './treeProfiles';

// World Richness Phase 7: trees follow the exact same narrative gate as
// ground-clutter flora (scatterProfiles.ts) — real forest only on Earth,
// sparse ambiguous growths only on bodies whose life question is still
// open, nothing anywhere else.
describe('getTrees narrative gating', () => {
  it('gives Earth a real forest', () => {
    const profiles = getTrees('Jorden');
    expect(profiles).toHaveLength(1);
    expect(profiles[0].density).toBeGreaterThan(0);
  });

  it('gives a not_detected body no trees at all', () => {
    // Merkurius: scienceNotes.lifeStatus === 'not_detected'.
    expect(getTrees('Merkurius')).toHaveLength(0);
  });

  it('gives a theoretical/inconclusive body a sparse ambiguous grove', () => {
    // Mars: scienceNotes.lifeStatus === 'theoretical'.
    const profiles = getTrees('Mars');
    expect(profiles).toHaveLength(1);
    // Deliberately sparser than Earth's forest.
    expect(profiles[0].density).toBeLessThan(getTrees('Jorden')[0].density);
  });
});

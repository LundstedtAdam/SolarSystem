import { describe, expect, it } from 'vitest';
import { getTrees } from './treeProfiles';
import { EARTH_TREE_DENSITY } from './trees';

// World Richness Phase 7 / Material Identity pass: this cosmetic profile
// system now covers only the sparse ambiguous-growth narrative gate — Earth's
// real forest moved to voxel-embedded trees (trees.ts/worldGen.ts's
// stampTrees) so it's choppable, and no longer shows up as a cosmetic
// profile here at all.
describe('getTrees narrative gating', () => {
  it('gives Earth no cosmetic profile (real trees are voxel-embedded now)', () => {
    expect(getTrees('Jorden')).toHaveLength(0);
  });

  it('gives a not_detected body no trees at all', () => {
    // Merkurius: scienceNotes.lifeStatus === 'not_detected'.
    expect(getTrees('Merkurius')).toHaveLength(0);
  });

  it('gives a theoretical/inconclusive body a sparse ambiguous grove', () => {
    // Mars: scienceNotes.lifeStatus === 'theoretical'.
    const profiles = getTrees('Mars');
    expect(profiles).toHaveLength(1);
    // Deliberately sparser than Earth's real (voxel) forest density.
    expect(profiles[0].density).toBeLessThan(EARTH_TREE_DENSITY);
  });
});

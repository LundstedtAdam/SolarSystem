import { describe, expect, it } from 'vitest';
import { leafHasNearbyLog, findDecayedLeavesNear } from './treeDecay';
import { BLOCK } from './voxelTypes';

function makeWorld(voxels: Record<string, number>): (x: number, y: number, z: number) => number {
  return (x, y, z) => voxels[`${x},${y},${z}`] ?? BLOCK.AIR;
}

describe('leafHasNearbyLog', () => {
  it('is true when a log sits within the decay radius', () => {
    const getBlock = makeWorld({ '0,0,0': BLOCK.WOOD_LOG });
    expect(leafHasNearbyLog(2, 0, 0, getBlock)).toBe(true);
  });

  it('is false when the nearest log is far outside the decay radius', () => {
    const getBlock = makeWorld({ '0,0,0': BLOCK.WOOD_LOG });
    expect(leafHasNearbyLog(50, 0, 0, getBlock)).toBe(false);
  });
});

describe('findDecayedLeavesNear', () => {
  it('keeps a leaf adjacent to a surviving log', () => {
    const getBlock = makeWorld({
      '0,0,0': BLOCK.WOOD_LOG,
      '1,0,0': BLOCK.LEAVES,
    });
    const decayed = findDecayedLeavesNear(0, 0, 0, 0, getBlock);
    expect(decayed).toEqual([]);
  });

  it('decays a leaf far from any log', () => {
    const getBlock = makeWorld({
      '10,10,10': BLOCK.LEAVES,
    });
    const decayed = findDecayedLeavesNear(0, 0, 0, 0, getBlock);
    // Out of the scanned box entirely (padded box is only wx/wz ± radius
    // around the felled column) — nothing to report, nothing decays here.
    expect(decayed).toEqual([]);
  });

  it('decays a disconnected leaf within the scanned box', () => {
    const getBlock = makeWorld({
      '3,0,0': BLOCK.LEAVES, // within the padded box, no log anywhere nearby
    });
    const decayed = findDecayedLeavesNear(0, 0, 0, 0, getBlock);
    expect(decayed).toEqual([[3, 0, 0]]);
  });

  it('only ever returns positions that are actually LEAVES', () => {
    const getBlock = makeWorld({
      '1,0,0': BLOCK.WOOD_LOG,
      '2,0,0': BLOCK.SURFACE,
      '3,0,0': BLOCK.LEAVES,
    });
    const decayed = findDecayedLeavesNear(0, 0, 0, 0, getBlock);
    for (const [x, y, z] of decayed) {
      expect(getBlock(x, y, z)).toBe(BLOCK.LEAVES);
    }
  });
});

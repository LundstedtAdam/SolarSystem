import { describe, expect, it } from 'vitest';
import { generateTree, EARTH_TREE_PARAMS, TREE_MAX_HALF_EXTENT } from './trees';
import { BLOCK } from './voxelTypes';

describe('generateTree', () => {
  it('is deterministic for a fixed seed', () => {
    const a = generateTree(12345);
    const b = generateTree(12345);
    expect(a).toEqual(b);
  });

  it('caches results (repeated calls return the identical object)', () => {
    const a = generateTree(42);
    const b = generateTree(42);
    expect(a).toBe(b);
  });

  it('produces a trunk of WOOD_LOG voxels and a canopy of LEAVES voxels', () => {
    const t = generateTree(777);
    const logs = t.voxels.filter((v) => v.block === BLOCK.WOOD_LOG);
    const leaves = t.voxels.filter((v) => v.block === BLOCK.LEAVES);
    expect(logs.length).toBeGreaterThan(0);
    expect(leaves.length).toBeGreaterThan(0);
  });

  it('keeps trunk height within the authored range across many seeds', () => {
    for (let seed = 0; seed < 40; seed++) {
      const t = generateTree(seed);
      const logs = t.voxels.filter((v) => v.block === BLOCK.WOOD_LOG);
      expect(logs.length).toBeGreaterThanOrEqual(EARTH_TREE_PARAMS.minHeight);
      expect(logs.length).toBeLessThanOrEqual(EARTH_TREE_PARAMS.maxHeight);
    }
  });

  it('never places the trunk core (0,y,0 below the crown) as leaves', () => {
    for (let seed = 0; seed < 20; seed++) {
      const t = generateTree(seed);
      // The trunk's local x/z position shifts after normalization but stays a
      // single column — find it via the WOOD_LOG voxels' shared (x,z).
      const trunk = t.voxels.filter((v) => v.block === BLOCK.WOOD_LOG);
      const { x: tx, z: tz } = trunk[0];
      expect(trunk.every((v) => v.x === tx && v.z === tz)).toBe(true);
      const leafOnCore = t.voxels.some(
        (v) => v.block === BLOCK.LEAVES && v.x === tx && v.z === tz && v.y < trunk.length,
      );
      expect(leafOnCore).toBe(false);
    }
  });

  it('stays within the declared max half-extent across many seeds', () => {
    for (let seed = 0; seed < 40; seed++) {
      const t = generateTree(seed);
      expect(t.footprint[0]).toBeLessThanOrEqual(TREE_MAX_HALF_EXTENT * 2 + 1);
      expect(t.footprint[1]).toBeLessThanOrEqual(TREE_MAX_HALF_EXTENT * 2 + 1);
    }
  });
});

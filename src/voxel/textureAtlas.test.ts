import { describe, expect, it } from 'vitest';
import { BLOCK } from './voxelTypes';
import { getBlockFaceTileIndex, getBlockFaceTiles, tileUVRect, ATLAS_GRID } from './textureAtlas';

describe('getBlockFaceTiles', () => {
  it('gives grass distinct top/side/bottom materials', () => {
    const tiles = getBlockFaceTiles(BLOCK.GRASS);
    expect(tiles.top).toBe('grass_top');
    expect(tiles.side).toBe('grass_side');
    expect(tiles.bottom).toBe('dirt');
  });

  it('gives wood a bark side distinct from its top/bottom cap', () => {
    const tiles = getBlockFaceTiles(BLOCK.WOOD_LOG);
    expect(tiles.side).toBe('bark_side');
    expect(tiles.top).toBe('bark_top');
    expect(tiles.bottom).toBe('bark_top');
  });

  it('gives uniform blocks the same tile on every face', () => {
    const tiles = getBlockFaceTiles(BLOCK.ROCK);
    expect(tiles.top).toBe(tiles.side);
    expect(tiles.side).toBe(tiles.bottom);
  });

  it('routes any ore id to the shared ore_fleck tile', () => {
    expect(getBlockFaceTiles(BLOCK.IRON_ORE).top).toBe('ore_fleck');
    expect(getBlockFaceTiles(BLOCK.ARTIFACT).top).toBe('ore_fleck');
  });

  it('gives leaves a uniform decayed-foliage material', () => {
    const tiles = getBlockFaceTiles(BLOCK.LEAVES);
    expect(tiles.top).toBe('leaves');
    expect(tiles.side).toBe('leaves');
    expect(tiles.bottom).toBe('leaves');
  });
});

describe('getBlockFaceTileIndex', () => {
  it('resolves the top face on the vertical sweep axis (axis 1, dir +1)', () => {
    const top = getBlockFaceTileIndex(BLOCK.GRASS, 1, 1);
    const side = getBlockFaceTileIndex(BLOCK.GRASS, 0, 1);
    const bottom = getBlockFaceTileIndex(BLOCK.GRASS, 1, -1);
    expect(top).not.toBe(side);
    expect(top).not.toBe(bottom);
    expect(side).not.toBe(bottom);
  });

  it('treats both horizontal sweep axes as side faces', () => {
    const a = getBlockFaceTileIndex(BLOCK.WOOD_LOG, 0, 1);
    const b = getBlockFaceTileIndex(BLOCK.WOOD_LOG, 2, -1);
    expect(a).toBe(b);
  });

  it('is deterministic for the same inputs', () => {
    expect(getBlockFaceTileIndex(BLOCK.SAND, 1, 1)).toBe(getBlockFaceTileIndex(BLOCK.SAND, 1, 1));
  });
});

describe('tileUVRect', () => {
  it('places tile 0 at the atlas origin', () => {
    expect(tileUVRect(0)).toEqual([0, 0]);
  });

  it('advances one tile-width per index within a row', () => {
    const [u0] = tileUVRect(0);
    const [u1] = tileUVRect(1);
    expect(u1 - u0).toBeCloseTo(1 / ATLAS_GRID);
  });
});

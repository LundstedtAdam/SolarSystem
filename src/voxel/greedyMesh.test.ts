import { describe, expect, it } from 'vitest';
import { greedyMesh } from './greedyMesh';
import {
  BLOCK,
  BLOCK_COUNT,
  PADDED_VOLUME,
  PALETTE_STRIDE,
  packVoxel,
  paddedIndex,
} from './voxelTypes';

/** Flat grey palette so colour assertions are simple. */
function makePalette(): Float32Array {
  const p = new Float32Array(BLOCK_COUNT * PALETTE_STRIDE);
  for (let i = 0; i < BLOCK_COUNT; i++) {
    p[i * PALETTE_STRIDE] = 0.5;
    p[i * PALETTE_STRIDE + 1] = 0.5;
    p[i * PALETTE_STRIDE + 2] = 0.5;
  }
  return p;
}

/** Empty padded neighbourhood with a setter in chunk-local coordinates. */
function makeChunk(): { voxels: Uint32Array; set: (x: number, y: number, z: number, id: number) => void } {
  const voxels = new Uint32Array(PADDED_VOLUME);
  return {
    voxels,
    set: (x, y, z, id) => {
      voxels[paddedIndex(x + 1, y + 1, z + 1)] = packVoxel(id);
    },
  };
}

describe('greedyMesh', () => {
  it('produces no geometry for an all-air chunk', () => {
    const { voxels } = makeChunk();
    const m = greedyMesh(voxels, makePalette()).opaque;
    expect(m.indexCount).toBe(0);
  });

  it('meshes a single voxel as 6 quads (24 vertices, 36 indices)', () => {
    const c = makeChunk();
    c.set(5, 5, 5, BLOCK.ROCK);
    const m = greedyMesh(c.voxels, makePalette()).opaque;
    expect(m.indexCount).toBe(36);
    expect(m.positions.length).toBe(24 * 3);
    expect(m.normals.length).toBe(24 * 3);
    expect(m.colors.length).toBe(24 * 4);
  });

  it('culls the shared interior face and merges coplanar faces of a 2-voxel bar', () => {
    const c = makeChunk();
    c.set(5, 5, 5, BLOCK.ROCK);
    c.set(6, 5, 5, BLOCK.ROCK);
    const m = greedyMesh(c.voxels, makePalette()).opaque;
    // Greedy merging: 2 end caps + 4 merged 2x1 side quads = 6 quads, not the
    // 12 - 2 = 10 a naive per-voxel mesher would emit.
    expect(m.indexCount).toBe(6 * 6);
  });

  it('does not merge faces across different block ids', () => {
    const c = makeChunk();
    c.set(5, 5, 5, BLOCK.ROCK);
    c.set(6, 5, 5, BLOCK.ICE);
    const m = greedyMesh(c.voxels, makePalette()).opaque;
    // Interior face still culled, but the 4 long sides stay split per material:
    // 2 end caps + 8 side quads = 10 quads.
    expect(m.indexCount).toBe(10 * 6);
  });

  it('culls faces against the padded neighbour border (chunk seams)', () => {
    const c = makeChunk();
    // A voxel at the -x chunk edge with a solid neighbour just outside the
    // chunk: the seam face must not be emitted.
    c.set(0, 5, 5, BLOCK.ROCK);
    c.voxels[paddedIndex(0, 6, 6)] = packVoxel(BLOCK.ROCK); // border neighbour at x = -1
    const m = greedyMesh(c.voxels, makePalette()).opaque;
    expect(m.indexCount).toBe(5 * 6);
  });

  it('bakes palette colour (scaled by AO) into vertex colours', () => {
    const c = makeChunk();
    c.set(5, 5, 5, BLOCK.ROCK);
    const m = greedyMesh(c.voxels, makePalette()).opaque;
    // A lone voxel is fully unoccluded: every corner gets AO level 3 (x1.0),
    // so the colour equals the palette entry exactly.
    for (let v = 0; v < 24; v++) {
      expect(m.colors[v * 4]).toBeCloseTo(0.5, 5);
      expect(m.colors[v * 4 + 3]).toBe(0); // no emissive in the test palette
    }
  });
});

describe('greedyMesh water pass', () => {
  it('puts a lone water voxel in the water group only (6 faces vs air)', () => {
    const c = makeChunk();
    c.set(5, 5, 5, BLOCK.WATER);
    const { opaque, water } = greedyMesh(c.voxels, makePalette());
    expect(opaque.indexCount).toBe(0);
    expect(water.indexCount).toBe(6 * 6);
  });

  it('never emits water faces against solids (only against air)', () => {
    const c = makeChunk();
    c.set(5, 5, 5, BLOCK.WATER);
    c.set(6, 5, 5, BLOCK.ROCK);
    const { opaque, water } = greedyMesh(c.voxels, makePalette());
    // Water: 5 faces against air; the face toward the rock is culled.
    expect(water.indexCount).toBe(5 * 6);
    // Rock: water counts as air in the opaque pass, so all 6 faces exist —
    // the terrain stays visible through the translucent surface.
    expect(opaque.indexCount).toBe(6 * 6);
  });

  it('gives submerged terrain a top face and the water column a surface', () => {
    const c = makeChunk();
    c.set(5, 4, 5, BLOCK.ROCK); // lakebed
    c.set(5, 5, 5, BLOCK.WATER); // water on top
    const { opaque, water } = greedyMesh(c.voxels, makePalette());
    expect(opaque.indexCount).toBe(6 * 6); // rock fully faced, incl. under water
    expect(water.indexCount).toBe(5 * 6); // all but the face into the rock
  });

  it('skips AO on water faces (full-bright palette colour)', () => {
    const c = makeChunk();
    c.set(5, 5, 5, BLOCK.WATER);
    c.set(6, 5, 5, BLOCK.ROCK); // an occluder that WOULD darken AO corners
    const { water } = greedyMesh(c.voxels, makePalette());
    for (let v = 0; v < water.positions.length / 3; v++) {
      expect(water.colors[v * 4]).toBeCloseTo(0.5, 5);
    }
  });
});

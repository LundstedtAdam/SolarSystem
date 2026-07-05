// Material Identity pass — leaf-disconnection decay. After a chop cascade
// removes some trunk voxels (see ChunkManager.tsx's chopTrunkUpward), any
// LEAVES voxel left with no WOOD_LOG within a small radius is no longer
// attached to a living tree and quietly disappears.
//
// Scoped to the felled column's own padded bounding box only — a chop can
// only ever disconnect leaves that were relying on THAT trunk; leaves
// belonging to any other tree are provably out of range and untouched. This
// keeps the check cheap enough for the mining hot path without a general
// voxel-grid BFS/flood-fill.

import { BLOCK } from './voxelTypes';

/** Chebyshev-distance radius within which a leaf voxel still counts as
 *  attached to a log. Approximates Minecraft's real leaf-decay rule
 *  qualitatively, not a byte-for-byte port of its algorithm. */
const LEAF_DECAY_RADIUS = 4;

type GetBlock = (x: number, y: number, z: number) => number;

/** True if any WOOD_LOG voxel exists within LEAF_DECAY_RADIUS of the given
 *  world position (Chebyshev distance — a cube neighbourhood, not a sphere). */
export function leafHasNearbyLog(wx: number, wy: number, wz: number, getBlock: GetBlock): boolean {
  const r = LEAF_DECAY_RADIUS;
  for (let dy = -r; dy <= r; dy++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (getBlock(wx + dx, wy + dy, wz + dz) === BLOCK.WOOD_LOG) return true;
      }
    }
  }
  return false;
}

/** Scans the padded bounding box around a felled trunk column
 *  ([wyFrom, wyTo] inclusive) for LEAVES voxels that no longer have a nearby
 *  log, and returns their world positions. Does not mutate anything — the
 *  caller removes each returned voxel via editVoxel. */
export function findDecayedLeavesNear(
  wx: number,
  wyFrom: number,
  wyTo: number,
  wz: number,
  getBlock: GetBlock,
): Array<[number, number, number]> {
  const r = LEAF_DECAY_RADIUS;
  const out: Array<[number, number, number]> = [];
  for (let y = wyFrom - r; y <= wyTo + r; y++) {
    for (let z = wz - r; z <= wz + r; z++) {
      for (let x = wx - r; x <= wx + r; x++) {
        if (getBlock(x, y, z) !== BLOCK.LEAVES) continue;
        if (!leafHasNearbyLog(x, y, z, getBlock)) out.push([x, y, z]);
      }
    }
  }
  return out;
}

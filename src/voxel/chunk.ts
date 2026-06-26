// Per-chunk voxel storage. Authoritative voxel data lives here on the main
// thread (so edits and, later, collision can read/write it directly); the
// mesher worker only ever receives a transient padded copy. Storage is a
// bit-packed Uint32Array (see voxelTypes for the layout).

import {
  CHUNK_SIZE,
  CHUNK_VOLUME,
  chunkIndex,
  packVoxel,
  voxelId,
  BLOCK,
  type BlockId,
} from './voxelTypes';

export function chunkKey(cx: number, cy: number, cz: number): string {
  return `${cx},${cy},${cz}`;
}

export class Chunk {
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly key: string;
  readonly voxels: Uint32Array;

  /** Set once worldgen has filled the array. */
  generated = false;
  /** Bumped on every edit; the mesher echoes the rev so stale meshes drop. */
  rev = 0;
  /** rev of the most recent mesh actually applied (-1 = never meshed). */
  meshedRev = -1;
  /** True if every voxel is AIR — skip meshing entirely. */
  empty = true;

  /** Sparse session edit overlay (localIndex -> packed voxel), kept so edits
   *  survive a regenerate and could be persisted per body (9.3b). */
  readonly edits = new Map<number, number>();

  constructor(cx: number, cy: number, cz: number) {
    this.cx = cx;
    this.cy = cy;
    this.cz = cz;
    this.key = chunkKey(cx, cy, cz);
    this.voxels = new Uint32Array(CHUNK_VOLUME);
  }

  /** Read a local voxel (no bounds check; caller stays in [0,CHUNK_SIZE)). */
  get(x: number, y: number, z: number): number {
    return this.voxels[chunkIndex(x, y, z)];
  }

  /** Apply the persisted edit overlay after a (re)generate. */
  reapplyEdits(): void {
    for (const [idx, val] of this.edits) this.voxels[idx] = val;
  }

  /** Recompute the `empty` flag (called by worldgen after filling). */
  refreshEmpty(): void {
    let empty = true;
    for (let i = 0; i < CHUNK_VOLUME; i++) {
      if (voxelId(this.voxels[i]) !== BLOCK.AIR) {
        empty = false;
        break;
      }
    }
    this.empty = empty;
  }

  /** Edit one local voxel; records it in the overlay and bumps the rev.
   *  Returns true if the value actually changed. */
  setLocal(x: number, y: number, z: number, id: BlockId): boolean {
    if (x < 0 || y < 0 || z < 0 || x >= CHUNK_SIZE || y >= CHUNK_SIZE || z >= CHUNK_SIZE) {
      return false;
    }
    const idx = chunkIndex(x, y, z);
    const next = packVoxel(id);
    if (this.voxels[idx] === next) return false;
    this.voxels[idx] = next;
    this.edits.set(idx, next);
    this.rev++;
    if (id !== BLOCK.AIR) this.empty = false;
    return true;
  }

  /** True if this chunk's current rev hasn't been meshed yet. */
  needsMesh(): boolean {
    return !this.empty && this.meshedRev !== this.rev;
  }
}

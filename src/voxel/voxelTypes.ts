// Phase 9.1 — shared voxel constants, bit-packing layout, and the strict
// contract for messages crossing the main-thread <-> mesher-worker boundary.
//
// Everything that travels to/from the worker is a concrete TypedArray so type
// safety holds across `postMessage`; the backing `ArrayBuffer`s are listed in a
// `transfer` array so they move zero-copy instead of being structure-cloned.

/** Voxels per chunk edge. The chunk is CHUNK_SIZE³ voxels. */
export const CHUNK_SIZE = 32;
/** World units per voxel. */
export const VOXEL_SIZE = 1;
/** Padded edge: chunk + 1 voxel of neighbour border on each side (for face
 *  culling and ambient-occlusion sampling across chunk seams). */
export const PADDED_SIZE = CHUNK_SIZE + 2;

/** Total voxels in a chunk / a padded neighbourhood. */
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE;
export const PADDED_VOLUME = PADDED_SIZE * PADDED_SIZE * PADDED_SIZE;

// --- Voxel bit layout (per Uint32) --------------------------------------------
// bits 0..9   block id   (1024 types)
// bits 10..13 sunlight   (reserved for 9.2 lighting; unused in 9.1)
// bits 14..17 metadata   (reserved)
const ID_MASK = 0x3ff;

export type BlockId = number;

/** Air is always id 0 and is the only non-solid block in 9.1. */
export const BLOCK = {
  AIR: 0,
  SURFACE: 1,
  SUBSOIL: 2,
  ROCK: 3,
} as const;

/** Number of block ids, including AIR — sizes the per-request colour palette. */
export const BLOCK_COUNT = 4;

export function packVoxel(id: BlockId): number {
  return id & ID_MASK;
}

export function voxelId(v: number): BlockId {
  return v & ID_MASK;
}

export function isSolid(v: number): boolean {
  return (v & ID_MASK) !== BLOCK.AIR;
}

/** Linear index into a CHUNK_SIZE³ array (no bounds check). */
export function chunkIndex(x: number, y: number, z: number): number {
  return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
}

/** Linear index into a PADDED_SIZE³ neighbourhood array. */
export function paddedIndex(x: number, y: number, z: number): number {
  return (y * PADDED_SIZE + z) * PADDED_SIZE + x;
}

// --- Worker message contract --------------------------------------------------

/** main -> worker: mesh this padded neighbourhood. `voxels` is PADDED_VOLUME
 *  longs; the actual chunk occupies indices [1..CHUNK_SIZE] on each axis. */
export interface MeshRequest {
  type: 'mesh';
  /** Stable chunk key so the result can be routed back to the right chunk. */
  key: string;
  /** Monotonic revision; a stale result (older than the chunk's current rev)
   *  is discarded so rapid edits never apply an out-of-date mesh. */
  rev: number;
  voxels: Uint32Array;
  /** Flat RGB palette, BLOCK_COUNT * 3 floats in 0..1, indexed by block id. */
  palette: Float32Array;
}

/** worker -> main: greedy-meshed geometry buffers (all transferable). An empty
 *  mesh (fully interior or fully air chunk) returns indexCount === 0. */
export interface MeshResult {
  type: 'mesh';
  key: string;
  rev: number;
  positions: Float32Array;
  normals: Float32Array;
  /** Per-vertex RGB with ambient occlusion already baked in. */
  colors: Float32Array;
  indices: Uint32Array;
  /** Number of indices actually used (buffers may be sized exactly). */
  indexCount: number;
}

/** Collect the transferable ArrayBuffers from a request (zero-copy hand-off). */
export function requestTransfer(req: MeshRequest): Transferable[] {
  return [req.voxels.buffer, req.palette.buffer];
}

/** Collect the transferable ArrayBuffers from a result. */
export function resultTransfer(res: MeshResult): Transferable[] {
  return [res.positions.buffer, res.normals.buffer, res.colors.buffer, res.indices.buffer];
}

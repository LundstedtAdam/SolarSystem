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

/** Block ids. Air is 0 and is the only non-solid block. The rest are archetype
 *  materials; per-body colours come from the palette (voxelBiomes). */
export const BLOCK = {
  AIR: 0,
  SURFACE: 1, // generic top (rock/regolith dust)
  SUBSOIL: 2, // generic mid layer
  ROCK: 3, // generic deep stone
  GRASS: 4, // earth vegetation top
  SAND: 5, // dune / desert top
  WATER: 6, // earth seas (opaque for now)
  ICE: 7, // ice archetype
  ICE_GLOW: 8, // luminous subsurface ice (emissive)
  LAVA: 9, // molten rock (emissive)
  SULPHUR: 10, // io sulphur deposits
  // Built materials for Phase 10 points-of-interest (ruined structures).
  METAL: 11, // hull / structural metal
  PANEL: 12, // floor / wall panelling
  GLASS: 13, // dome / window glazing
  // Phase 11 — mineable resource veins. Fundamentals occur on every body;
  // the rest are biome-specific (see contentProfiles resources + voxelBiomes
  // palette). Each maps to a ResourceType via ORE_TO_RESOURCE.
  CARBON_ORE: 14,
  SILICON_ORE: 15,
  IRON_ORE: 16,
  COPPER_ORE: 17,
  ZINC_ORE: 18,
  WOLFRAMITE_ORE: 19,
  SPHALERITE_ORE: 20,
  MALACHITE_ORE: 21,
  TUNGSTEN_ORE: 22,
  TITANITE_ORE: 23,
  HEMATITE_ORE: 24,
  LITHIUM_ORE: 25,
  ARTIFACT: 26, // anomalous artifact — deep hostile cores, endgame drives
} as const;

/** Number of block ids, including AIR. */
export const BLOCK_COUNT = 27;

/** Floats per palette entry: r, g, b, emissive. */
export const PALETTE_STRIDE = 4;

// --- Phase 11 resources ------------------------------------------------------

/** A gatherable resource. Mined ores plus (later) condensed gases and refined
 *  ingots. Inventory is keyed by these strings. */
export type ResourceType =
  | 'carbon'
  | 'silicon'
  | 'iron'
  | 'copper'
  | 'zinc'
  | 'wolframite'
  | 'sphalerite'
  | 'malachite'
  | 'tungsten'
  | 'titanite'
  | 'hematite'
  | 'lithium'
  | 'artifact';

/** Ore block id -> the resource it yields when mined. Non-ore blocks are absent
 *  (mining them just removes terrain and yields nothing). */
export const ORE_TO_RESOURCE: Partial<Record<number, ResourceType>> = {
  [BLOCK.CARBON_ORE]: 'carbon',
  [BLOCK.SILICON_ORE]: 'silicon',
  [BLOCK.IRON_ORE]: 'iron',
  [BLOCK.COPPER_ORE]: 'copper',
  [BLOCK.ZINC_ORE]: 'zinc',
  [BLOCK.WOLFRAMITE_ORE]: 'wolframite',
  [BLOCK.SPHALERITE_ORE]: 'sphalerite',
  [BLOCK.MALACHITE_ORE]: 'malachite',
  [BLOCK.TUNGSTEN_ORE]: 'tungsten',
  [BLOCK.TITANITE_ORE]: 'titanite',
  [BLOCK.HEMATITE_ORE]: 'hematite',
  [BLOCK.LITHIUM_ORE]: 'lithium',
  [BLOCK.ARTIFACT]: 'artifact',
};

/** True if a block id is a mineable ore (yields a resource). */
export function isOre(id: BlockId): boolean {
  return ORE_TO_RESOURCE[id] !== undefined;
}

/** Seconds of continuous mining to break a block. Soft topsoils break fast;
 *  rock and ore are slower; artifacts are the slowest. Unlisted solids use
 *  DEFAULT_HARDNESS. Returned by blockHardness(). */
const DEFAULT_HARDNESS = 0.5;
const HARDNESS: Partial<Record<number, number>> = {
  [BLOCK.SURFACE]: 0.35,
  [BLOCK.SUBSOIL]: 0.45,
  [BLOCK.GRASS]: 0.3,
  [BLOCK.SAND]: 0.3,
  [BLOCK.ICE]: 0.5,
  [BLOCK.ICE_GLOW]: 0.6,
  [BLOCK.ROCK]: 0.9,
  [BLOCK.SULPHUR]: 0.5,
  [BLOCK.LAVA]: 1.2,
  [BLOCK.METAL]: 1.4,
  [BLOCK.PANEL]: 1.1,
  [BLOCK.GLASS]: 0.6,
  [BLOCK.CARBON_ORE]: 1.0,
  [BLOCK.SILICON_ORE]: 1.0,
  [BLOCK.IRON_ORE]: 1.3,
  [BLOCK.COPPER_ORE]: 1.2,
  [BLOCK.ZINC_ORE]: 1.2,
  [BLOCK.WOLFRAMITE_ORE]: 1.5,
  [BLOCK.SPHALERITE_ORE]: 1.3,
  [BLOCK.MALACHITE_ORE]: 1.3,
  [BLOCK.TUNGSTEN_ORE]: 1.7,
  [BLOCK.TITANITE_ORE]: 1.5,
  [BLOCK.HEMATITE_ORE]: 1.4,
  [BLOCK.LITHIUM_ORE]: 1.4,
  [BLOCK.ARTIFACT]: 2.4,
};

/** Seconds of continuous mining required to break the given block. */
export function blockHardness(id: BlockId): number {
  return HARDNESS[id] ?? DEFAULT_HARDNESS;
}

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

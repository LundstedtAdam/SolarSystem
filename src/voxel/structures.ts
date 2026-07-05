// Phase 10.2 — modular point-of-interest generation. A POI is assembled from a
// pool of voxel modules connected Jigsaw-style on a coarse grid, then run
// through a procedural damage pass (collapse + environmental reclamation) so no
// two instances are alike — the physical layers of narrative stratigraphy:
// the structure that was built, the disruption that wrecked it, and the planet
// reclaiming it. Pure + deterministic (seed in → identical structure out) so a
// POI that straddles chunk seams stamps consistently. worldGen anchors and
// stamps the returned voxels into chunks at generation time.

import { BLOCK } from './voxelTypes';
import type { Archetype } from './voxelBiomes';
import type { POIType } from './contentProfiles';

/** A single solid voxel in structure-local space (origin at the floor's min
 *  corner; y is up). Only solids are emitted — interiors are naturally air. */
export interface SVoxel {
  x: number;
  y: number;
  z: number;
  block: number;
}

export interface BuiltStructure {
  voxels: SVoxel[];
  /** Horizontal footprint [W, D] in voxels (for centring on the anchor). */
  footprint: [number, number];
  height: number;
}

/** Module footprint edge (voxels). Each assembler grid cell is MW×MW. */
const MW = 8;

type ModuleKind =
  | 'room'
  | 'tower'
  | 'dome'
  | 'tank'
  | 'pipe'
  // World Richness Phase 3 — visual variety for the 'outpost' POIType.
  | 'bridge'
  | 'collapsed'
  // World Richness Phase 3 — the micro-discovery channel's sole module kind
  // (POI_CFG.cache, budget [1,1]): a tiny debris cluster, not a room.
  | 'cache';

// --- deterministic RNG (mulberry32) -----------------------------------------
export function rng32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- small dense voxel grid -------------------------------------------------
class Grid {
  readonly data: Uint16Array;
  constructor(
    readonly W: number,
    readonly H: number,
    readonly D: number,
  ) {
    this.data = new Uint16Array(W * H * D);
  }
  private inb(x: number, y: number, z: number): boolean {
    return x >= 0 && x < this.W && y >= 0 && y < this.H && z >= 0 && z < this.D;
  }
  private idx(x: number, y: number, z: number): number {
    return (y * this.D + z) * this.W + x;
  }
  set(x: number, y: number, z: number, b: number): void {
    if (this.inb(x, y, z)) this.data[this.idx(x, y, z)] = b;
  }
  get(x: number, y: number, z: number): number {
    return this.inb(x, y, z) ? this.data[this.idx(x, y, z)] : 0;
  }
}

interface Openings {
  N: boolean;
  S: boolean;
  E: boolean;
  W: boolean;
}

interface BuildCfg {
  wall: number;
  floor: number;
  roof: number;
  glassRoof: boolean;
}

function heightFor(kind: ModuleKind, rng: () => number): number {
  switch (kind) {
    case 'tower':
      return 10 + Math.floor(rng() * 4);
    case 'tank':
      return 7 + Math.floor(rng() * 3);
    case 'pipe':
      return 3;
    default:
      return 6; // room, dome
  }
}

/** Build one module into the grid at cell origin (ox,oz), floor at y=0.
 *  `rng` is the same deterministic stream `build()` already threads through
 *  assemble()/heightFor()/damage() — consumed here by 'cache' (crate layout)
 *  and 'collapsed' (which wall voxels have already failed), still
 *  deterministic for a given seed since every module's calls happen in a
 *  fixed order. */
function buildModule(
  g: Grid,
  ox: number,
  oz: number,
  kind: ModuleKind,
  h: number,
  open: Openings,
  cfg: BuildCfg,
  rng: () => number,
): void {
  if (kind === 'cache') {
    // A tiny debris/crate cluster stacked near the cell centre — no floor
    // pad, deliberately not room-scale. This is what POI_CFG.cache (the
    // micro-discovery channel, budget [1,1]) builds: a single small find.
    const cx = ox + Math.floor(MW / 2);
    const cz = oz + Math.floor(MW / 2);
    const n = 4 + Math.floor(rng() * 3); // 4-6 voxels
    for (let i = 0; i < n; i++) {
      const dx = Math.floor(rng() * 3) - 1;
      const dz = Math.floor(rng() * 3) - 1;
      g.set(cx + dx, 1 + i, cz + dz, cfg.wall);
    }
    return;
  }

  // Floor for every remaining module kind.
  for (let x = 0; x < MW; x++)
    for (let z = 0; z < MW; z++) g.set(ox + x, 0, oz + z, cfg.floor);

  if (kind === 'tank') {
    // Open-topped cylinder of metal (geothermal vessel).
    const c = (MW - 1) / 2;
    const r = MW / 2 - 1;
    for (let y = 1; y < h; y++)
      for (let x = 0; x < MW; x++)
        for (let z = 0; z < MW; z++) {
          const d = Math.hypot(x - c, z - c);
          if (Math.abs(d - r) < 0.7) g.set(ox + x, y, oz + z, cfg.wall);
        }
    return;
  }

  if (kind === 'bridge') {
    // An elevated gangway fragment: a narrow raised walkway with corner
    // support pillars and low rails. A visual-variety piece — it doesn't
    // structurally connect to a neighbour's own floor height, which reads
    // fine given these are ruins, not functioning structures.
    const deckY = Math.min(h - 2, 4);
    const mid = Math.floor(MW / 2);
    for (let x = 0; x < MW; x++) {
      g.set(ox + x, deckY, oz + mid - 1, cfg.floor);
      g.set(ox + x, deckY, oz + mid, cfg.floor);
      g.set(ox + x, deckY, oz + mid + 1, cfg.floor);
      g.set(ox + x, deckY + 1, oz + mid - 1, cfg.wall);
      g.set(ox + x, deckY + 1, oz + mid + 1, cfg.wall);
    }
    for (let y = 0; y < deckY; y++) {
      g.set(ox + 1, y, oz + mid, cfg.wall);
      g.set(ox + MW - 2, y, oz + mid, cfg.wall);
    }
    return;
  }

  // Perimeter walls with doorways toward neighbouring modules. 'collapsed'
  // randomly drops wall voxels up front (always ruined, independent of the
  // shared damage() pass's roll) and skips the roof entirely — open to sky.
  const mid = MW / 2;
  const door = (side: 'N' | 'S' | 'E' | 'W', a: number, y: number): boolean =>
    open[side] && y <= 2 && a >= mid - 1 && a <= mid;
  const ruined = kind === 'collapsed';
  for (let y = 1; y < h; y++) {
    for (let x = 0; x < MW; x++) {
      if (!door('N', x, y) && !(ruined && rng() < 0.35)) g.set(ox + x, y, oz + 0, cfg.wall);
      if (!door('S', x, y) && !(ruined && rng() < 0.35)) g.set(ox + x, y, oz + MW - 1, cfg.wall);
    }
    for (let z = 0; z < MW; z++) {
      if (!door('W', z, y) && !(ruined && rng() < 0.35)) g.set(ox + 0, y, oz + z, cfg.wall);
      if (!door('E', z, y) && !(ruined && rng() < 0.35)) g.set(ox + MW - 1, y, oz + z, cfg.wall);
    }
  }
  if (ruined) return;

  // Roof: flat panel, or a glass dome for dome modules.
  if (kind === 'dome' && cfg.glassRoof) {
    const c = (MW - 1) / 2;
    const r = MW / 2;
    for (let x = 0; x < MW; x++)
      for (let z = 0; z < MW; z++) {
        const d = Math.hypot(x - c, z - c);
        const ry = Math.round(h - 1 + Math.cos((d / r) * (Math.PI / 2)) * 2);
        if (d <= r) g.set(ox + x, ry, oz + z, BLOCK.GLASS);
      }
  } else {
    for (let x = 0; x < MW; x++)
      for (let z = 0; z < MW; z++) g.set(ox + x, h - 1, oz + z, cfg.roof);
  }

  // Towers carry a thin antenna mast above the roof.
  if (kind === 'tower') {
    const cx = ox + Math.floor(MW / 2);
    const cz = oz + Math.floor(MW / 2);
    for (let y = h; y < h + 4; y++) g.set(cx, y, cz, cfg.wall);
  }
}

// --- Jigsaw assembler: connected modules on a coarse grid -------------------
interface Placed {
  gx: number;
  gz: number;
  kind: ModuleKind;
  h: number;
}

function assemble(pool: ModuleKind[], budget: number, rng: () => number): Placed[] {
  const placed: Placed[] = [];
  const occ = new Map<string, number>(); // cell -> placed index
  const key = (x: number, z: number) => `${x},${z}`;
  const start: ModuleKind = pool[0];
  placed.push({ gx: 0, gz: 0, kind: start, h: heightFor(start, rng) });
  occ.set(key(0, 0), 0);
  const frontier: [number, number][] = [[0, 0]];
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  let guard = 0;
  while (placed.length < budget && frontier.length && guard++ < 200) {
    const fi = Math.floor(rng() * frontier.length);
    const [cx, cz] = frontier[fi];
    const d = dirs[Math.floor(rng() * 4)];
    const nx = cx + d[0];
    const nz = cz + d[1];
    if (occ.has(key(nx, nz))) {
      if (rng() < 0.5) frontier.splice(fi, 1);
      continue;
    }
    const kind = pool[Math.floor(rng() * pool.length)];
    occ.set(key(nx, nz), placed.length);
    placed.push({ gx: nx, gz: nz, kind, h: heightFor(kind, rng) });
    frontier.push([nx, nz]);
    if (rng() < 0.4) frontier.splice(fi, 1);
  }
  return placed;
}

// --- procedural damage ------------------------------------------------------
/** Collapse upper structure and let the planet reclaim it. Deterministic via
 *  the same rng stream; biased so roofs/tops fail more than floors. */
function damage(g: Grid, reclaim: number, rng: () => number): void {
  // Collapse: higher voxels are likelier to be gone.
  for (let y = g.H - 1; y >= 1; y--) {
    const heightFrac = y / g.H;
    for (let z = 0; z < g.D; z++)
      for (let x = 0; x < g.W; x++) {
        if (g.get(x, y, z) === 0) continue;
        if (rng() < 0.1 + heightFrac * 0.5) g.set(x, y, z, 0);
      }
  }
  // Reclamation: dust/ice/sulphur piles inside on the floor and crusts exposed
  // tops, so the body is visibly taking the structure back.
  for (let z = 0; z < g.D; z++)
    for (let x = 0; x < g.W; x++) {
      if (g.get(x, 0, z) === 0) continue;
      if (rng() < 0.45) {
        const pile = 1 + Math.floor(rng() * 2);
        for (let y = 1; y <= pile; y++) if (g.get(x, y, z) === 0) g.set(x, y, z, reclaim);
      }
    }
  for (let y = 1; y < g.H; y++)
    for (let z = 0; z < g.D; z++)
      for (let x = 0; x < g.W; x++) {
        if (g.get(x, y, z) !== 0 && g.get(x, y + 1, z) === 0 && rng() < 0.16) {
          g.set(x, y + 1, z, reclaim);
        }
      }
}

const POI_CFG: Record<
  POIType,
  { pool: ModuleKind[]; budget: [number, number]; wall: number; floor: number; roof: number; glassRoof: boolean }
> = {
  processor: { pool: ['room', 'tank', 'pipe', 'tower'], budget: [4, 6], wall: BLOCK.METAL, floor: BLOCK.PANEL, roof: BLOCK.METAL, glassRoof: false },
  dome: { pool: ['dome', 'room', 'pipe'], budget: [3, 4], wall: BLOCK.PANEL, floor: BLOCK.PANEL, roof: BLOCK.GLASS, glassRoof: true },
  geothermal: { pool: ['tank', 'pipe', 'room'], budget: [4, 6], wall: BLOCK.METAL, floor: BLOCK.METAL, roof: BLOCK.METAL, glassRoof: false },
  relay: { pool: ['tower', 'room', 'pipe'], budget: [4, 5], wall: BLOCK.PANEL, floor: BLOCK.PANEL, roof: BLOCK.METAL, glassRoof: false },
  // World Richness Phase 3 additions.
  outpost: { pool: ['room', 'collapsed', 'bridge', 'tower'], budget: [4, 7], wall: BLOCK.METAL, floor: BLOCK.PANEL, roof: BLOCK.METAL, glassRoof: false },
  cache: { pool: ['cache'], budget: [1, 1], wall: BLOCK.METAL, floor: BLOCK.PANEL, roof: BLOCK.METAL, glassRoof: false },
};

function reclaimBlock(archetype: Archetype): number {
  switch (archetype) {
    case 'ice':
      return BLOCK.ICE;
    case 'lava':
      return BLOCK.SULPHUR;
    case 'dune':
      return BLOCK.SAND;
    case 'earth':
      return BLOCK.GRASS;
    default:
      return BLOCK.SURFACE; // rock / regolith dust
  }
}

// Cache built structures so a POI spanning several chunks is generated once.
const cache = new Map<string, BuiltStructure>();
const CACHE_MAX = 64;

function build(type: POIType, seed: number, archetype: Archetype): BuiltStructure {
  const cfg = POI_CFG[type];
  const rng = rng32(seed);
  const budget = cfg.budget[0] + Math.floor(rng() * (cfg.budget[1] - cfg.budget[0] + 1));
  const placed = assemble(cfg.pool, budget, rng);

  // Normalize cell coords to a 0-based grid and size the voxel grid.
  let minGx = Infinity;
  let minGz = Infinity;
  let maxGx = -Infinity;
  let maxGz = -Infinity;
  let maxH = 0;
  for (const p of placed) {
    minGx = Math.min(minGx, p.gx);
    minGz = Math.min(minGz, p.gz);
    maxGx = Math.max(maxGx, p.gx);
    maxGz = Math.max(maxGz, p.gz);
    maxH = Math.max(maxH, p.h);
  }
  const cellsX = maxGx - minGx + 1;
  const cellsZ = maxGz - minGz + 1;
  const g = new Grid(cellsX * MW, maxH + 6, cellsZ * MW);
  const cellSet = new Set(placed.map((p) => `${p.gx},${p.gz}`));

  const buildCfg: BuildCfg = { wall: cfg.wall, floor: cfg.floor, roof: cfg.roof, glassRoof: cfg.glassRoof };
  for (const p of placed) {
    const open: Openings = {
      N: cellSet.has(`${p.gx},${p.gz - 1}`),
      S: cellSet.has(`${p.gx},${p.gz + 1}`),
      W: cellSet.has(`${p.gx - 1},${p.gz}`),
      E: cellSet.has(`${p.gx + 1},${p.gz}`),
    };
    buildModule(g, (p.gx - minGx) * MW, (p.gz - minGz) * MW, p.kind, p.h, open, buildCfg, rng);
  }

  damage(g, reclaimBlock(archetype), rng);

  const voxels: SVoxel[] = [];
  for (let y = 0; y < g.H; y++)
    for (let z = 0; z < g.D; z++)
      for (let x = 0; x < g.W; x++) {
        const b = g.get(x, y, z);
        if (b !== 0) voxels.push({ x, y, z, block: b });
      }

  return { voxels, footprint: [g.W, g.D], height: g.H };
}

/** Generate (or fetch cached) a POI structure for a given type/seed/archetype. */
export function generatePOI(type: POIType, seed: number, archetype: Archetype): BuiltStructure {
  const key = `${type}:${seed}:${archetype}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const built = build(type, seed, archetype);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, built);
  return built;
}

/** Largest horizontal half-extent a POI can reach from its anchor — used by the
 *  chunk stamper to know which nearby POI cells can overlap a chunk. */
export const POI_MAX_HALF_EXTENT = 32;

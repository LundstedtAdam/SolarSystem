// Spatial broadphase for the asteroid belt. The belt is a thin torus, not a
// cube volume — a plain 3D world-space hash grid would waste huge numbers of
// empty cells outside the annulus, so this uses a cylindrical grid (radial +
// angular bins) instead. No vertical subdivision: THICKNESS is small enough
// relative to belt population that a 3rd axis wouldn't reduce candidate
// counts meaningfully.
//
// Queries must be done in *belt-local* space (i.e. with the whole-belt
// `group.rotation.y` orbital drift undone) — the grid itself never needs a
// per-frame rebuild for that drift, only for fracture events that add/remove
// asteroids.

import type { AsteroidState } from './asteroidState';
import { INNER, OUTER } from './asteroidLayout';
import { WORLD_SCALE } from './bodies';

export const RADIAL_CELL = 8 * WORLD_SCALE;
export const ANGULAR_BINS = 600;
const RADIAL_BINS = Math.max(1, Math.ceil((OUTER - INNER) / RADIAL_CELL));
const ANGULAR_WIDTH = (Math.PI * 2) / ANGULAR_BINS;

export interface AsteroidGrid {
  /** cell key -> array of global asteroid-state indices currently in it. */
  cells: Map<number, number[]>;
  radialBins: number;
}

function radialBinOf(r: number): number {
  const b = Math.floor((r - INNER) / RADIAL_CELL);
  return Math.min(RADIAL_BINS - 1, Math.max(0, b));
}

function angularBinOf(theta: number): number {
  const t = ((theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.min(ANGULAR_BINS - 1, Math.floor(t / ANGULAR_WIDTH));
}

function cellKey(radialBin: number, angularBin: number): number {
  return radialBin * ANGULAR_BINS + angularBin;
}

function cellKeyForPos(x: number, z: number): number {
  return cellKey(radialBinOf(Math.hypot(x, z)), angularBinOf(Math.atan2(z, x)));
}

/** Full O(n) rebuild — call only at (re)construction or after a fracture
 *  batch, never every frame (the belt's whole-group rotation doesn't require
 *  it; only genuine population/position changes do). */
export function buildAsteroidGrid(states: AsteroidState[]): AsteroidGrid {
  const cells = new Map<number, number[]>();
  for (let i = 0; i < states.length; i++) {
    const s = states[i];
    if (!s.alive) continue;
    const key = cellKeyForPos(s.pos.x, s.pos.z);
    let bucket = cells.get(key);
    if (!bucket) {
      bucket = [];
      cells.set(key, bucket);
    }
    bucket.push(i);
  }
  return { cells, radialBins: RADIAL_BINS };
}

/**
 * Candidate global indices within `radius` of belt-local `(x, z)`. Returns a
 * superset (cell-granularity, not an exact distance test) — callers do the
 * precise sphere test against the shortlist. Ring size grows with `radius`
 * relative to the cell size so a wider query (e.g. mining range) still finds
 * everything relevant.
 */
export function queryNearby(grid: AsteroidGrid, x: number, z: number, radius: number): number[] {
  const r = Math.hypot(x, z);
  const theta = Math.atan2(z, x);
  const rb = radialBinOf(r);
  const ab = angularBinOf(theta);
  const ring = Math.max(1, Math.ceil(radius / RADIAL_CELL));

  const result: number[] = [];
  for (let dr = -ring; dr <= ring; dr++) {
    const rbin = rb + dr;
    if (rbin < 0 || rbin >= grid.radialBins) continue;
    for (let da = -ring; da <= ring; da++) {
      const abin = ((ab + da) % ANGULAR_BINS + ANGULAR_BINS) % ANGULAR_BINS;
      const bucket = grid.cells.get(cellKey(rbin, abin));
      if (bucket) result.push(...bucket);
    }
  }
  return result;
}

/** Remove one asteroid from the grid (called on fracture — the parent is
 *  destroyed). No-op if it isn't present. */
export function removeFromGrid(grid: AsteroidGrid, globalIdx: number, x: number, z: number): void {
  const bucket = grid.cells.get(cellKeyForPos(x, z));
  if (!bucket) return;
  const i = bucket.indexOf(globalIdx);
  if (i >= 0) {
    bucket[i] = bucket[bucket.length - 1];
    bucket.pop();
  }
}

/** Insert one asteroid/debris index into the grid (called on fracture —
 *  spawned fragments that live in the belt-local frame). */
export function insertIntoGrid(grid: AsteroidGrid, globalIdx: number, x: number, z: number): void {
  const key = cellKeyForPos(x, z);
  let bucket = grid.cells.get(key);
  if (!bucket) {
    bucket = [];
    grid.cells.set(key, bucket);
  }
  bucket.push(globalIdx);
}

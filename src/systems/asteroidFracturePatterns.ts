// Precomputed "fracture patterns" for lethal asteroid hits. Real-time CSG/
// Voronoi mesh splitting has no precedent in this codebase and is too heavy
// for a tumbling background rock; this is a pragmatic approximation instead:
// partition each base geometry's faces into a handful of contiguous clusters
// once (via nearest-seed-point/Voronoi-on-sphere clustering of face
// centroids — no adjacency graph needed, just a distance/dot-product test
// per face), cache the partition, and at fracture time extract whichever
// clusters are needed straight from the *current* source geometry (which may
// already be locally dented — see asteroidDent.ts) so fragments visually
// read as pieces of the specific rock that broke, not generic rubble.

import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { cellHash } from '../voxel/noise';

const PATTERNS_PER_GEOMETRY = 2;
const MIN_CHUNKS = 3;
const MAX_CHUNKS = 6; // MIN_CHUNKS..MAX_CHUNKS inclusive

export interface FracturePattern {
  chunkCount: number;
  /** One entry per face (triangle), value = which chunk cluster it belongs to. */
  faceClusterId: Int32Array;
}

const patternCache = new Map<string, FracturePattern[]>();

function faceCount(geometry: BufferGeometry): number {
  const index = geometry.index;
  return Math.floor((index ? index.count : geometry.attributes.position.count) / 3);
}

const _va = new Vector3();
const _vb = new Vector3();
const _vc = new Vector3();

function faceIndices(geometry: BufferGeometry, faceIdx: number): [number, number, number] {
  const index = geometry.index;
  if (index) return [index.getX(faceIdx * 3), index.getX(faceIdx * 3 + 1), index.getX(faceIdx * 3 + 2)];
  const base = faceIdx * 3;
  return [base, base + 1, base + 2];
}

function faceCentroidDirection(geometry: BufferGeometry, faceIdx: number, out: Vector3): Vector3 {
  const pos = geometry.attributes.position;
  const [a, b, c] = faceIndices(geometry, faceIdx);
  _va.fromBufferAttribute(pos, a);
  _vb.fromBufferAttribute(pos, b);
  _vc.fromBufferAttribute(pos, c);
  return out.copy(_va).add(_vb).add(_vc).divideScalar(3).normalize();
}

/**
 * Precomputed patterns for one (tierIdx, variantIdx)'s base geometry topology
 * — dents only move vertex *positions*, never add/remove faces, so a face's
 * cluster assignment computed against the pristine topology stays valid
 * forever, including against a live dented promoted mesh. Cached lazily on
 * first use (mirrors `rockGeometry`'s one-time-factory framing) — a handful
 * of patterns total across the belt's 6 base geometries, not a per-frame cost.
 */
export function getFracturePatterns(tierIdx: number, variantIdx: number, geometry: BufferGeometry): FracturePattern[] {
  const key = `${tierIdx}:${variantIdx}`;
  const cached = patternCache.get(key);
  if (cached) return cached;

  const nFaces = faceCount(geometry);
  const patterns: FracturePattern[] = [];
  const centroid = new Vector3();

  for (let p = 0; p < PATTERNS_PER_GEOMETRY; p++) {
    const chunkCount =
      MIN_CHUNKS + Math.floor(cellHash(tierIdx, variantIdx * 2 + p, 8000) * (MAX_CHUNKS - MIN_CHUNKS + 1));
    const seeds: Vector3[] = [];
    for (let k = 0; k < chunkCount; k++) {
      const stream = variantIdx * 100 + p * 10 + k;
      const theta = cellHash(tierIdx, stream, 8001) * Math.PI * 2;
      const phi = Math.acos(cellHash(tierIdx, stream, 8002) * 2 - 1);
      seeds.push(new Vector3(Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi)));
    }
    const faceClusterId = new Int32Array(nFaces);
    for (let f = 0; f < nFaces; f++) {
      faceCentroidDirection(geometry, f, centroid);
      let best = 0;
      let bestDot = -Infinity;
      for (let k = 0; k < seeds.length; k++) {
        const dot = centroid.dot(seeds[k]);
        if (dot > bestDot) {
          bestDot = dot;
          best = k;
        }
      }
      faceClusterId[f] = best;
    }
    patterns.push({ chunkCount, faceClusterId });
  }

  patternCache.set(key, patterns);
  return patterns;
}

/** Deterministic pattern selection for a specific hit — matches the existing
 *  `cellHash`-based hashing convention used throughout the fracture system. */
export function pickPattern(patterns: FracturePattern[], globalIdx: number, hitSeq: number, seed: number): FracturePattern {
  const idx = cellHash(globalIdx, hitSeq, seed + 7000) < 0.5 ? 0 : 1;
  return patterns[Math.min(idx, patterns.length - 1)];
}

/** Deterministically pick `count` distinct cluster indices out of
 *  `pattern.chunkCount` (count is expected to already be clamped to
 *  chunkCount by the caller, so this never needs to repeat an index). */
export function pickClusterIndices(pattern: FracturePattern, count: number, globalIdx: number, hitSeq: number, seed: number): number[] {
  const pool = Array.from({ length: pattern.chunkCount }, (_, i) => i);
  const picked: number[] = [];
  const n = Math.min(count, pattern.chunkCount);
  for (let k = 0; k < n; k++) {
    const h = cellHash(globalIdx, hitSeq * 100 + k, seed + 7100);
    const idx = Math.floor(h * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

/** Cheap centroid-only computation (unit-object-space direction of the
 *  cluster's center) — used by the momentum formula, which only needs the
 *  offset-from-parent-center, not a renderable geometry. */
export function computeClusterCentroid(sourceGeometry: BufferGeometry, pattern: FracturePattern, clusterIdx: number, out: Vector3): Vector3 {
  const pos = sourceGeometry.attributes.position;
  out.set(0, 0, 0);
  let n = 0;
  for (let f = 0; f < pattern.faceClusterId.length; f++) {
    if (pattern.faceClusterId[f] !== clusterIdx) continue;
    const [a, b, c] = faceIndices(sourceGeometry, f);
    _va.fromBufferAttribute(pos, a);
    _vb.fromBufferAttribute(pos, b);
    _vc.fromBufferAttribute(pos, c);
    out.add(_va).add(_vb).add(_vc);
    n += 3;
  }
  if (n > 0) out.divideScalar(n);
  return out;
}

/**
 * Full extraction: pulls the cluster's faces from the *current* source
 * buffer into a standalone, non-indexed, recentered BufferGeometry — this is
 * what makes a fragment visually read as a piece of the specific (possibly
 * already-dented) rock it came from, since clustering topology is shared but
 * vertex data is always fresh. Returns the geometry plus the same centroid
 * `computeClusterCentroid` would produce (in the *original*, un-recentered
 * source space) so callers can use it as the fragment's offset-from-parent-
 * center for the momentum formula.
 */
export function extractChunkGeometry(
  sourceGeometry: BufferGeometry,
  pattern: FracturePattern,
  clusterIdx: number,
): { geometry: BufferGeometry; centroid: Vector3 } {
  const pos = sourceGeometry.attributes.position;
  const positions: number[] = [];
  for (let f = 0; f < pattern.faceClusterId.length; f++) {
    if (pattern.faceClusterId[f] !== clusterIdx) continue;
    const [a, b, c] = faceIndices(sourceGeometry, f);
    for (const vi of [a, b, c]) {
      positions.push(pos.getX(vi), pos.getY(vi), pos.getZ(vi));
    }
  }

  const centroid = new Vector3();
  const nVerts = positions.length / 3;
  for (let i = 0; i < nVerts; i++) centroid.add(new Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]));
  if (nVerts > 0) centroid.divideScalar(nVerts);
  for (let i = 0; i < nVerts; i++) {
    positions[i * 3] -= centroid.x;
    positions[i * 3 + 1] -= centroid.y;
    positions[i * 3 + 2] -= centroid.z;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  return { geometry, centroid };
}

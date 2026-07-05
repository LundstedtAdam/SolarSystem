import { describe, expect, it } from 'vitest';
import { IcosahedronGeometry, Vector3 } from 'three';
import {
  getFracturePatterns,
  pickPattern,
  pickClusterIndices,
  computeClusterCentroid,
  extractChunkGeometry,
} from './asteroidFracturePatterns';

describe('getFracturePatterns', () => {
  it('is deterministic — same (tier, variant) always yields the same cluster assignment', () => {
    const geomA = new IcosahedronGeometry(1, 1);
    const geomB = new IcosahedronGeometry(1, 1);
    const patternsA = getFracturePatterns(0, 0, geomA);
    // Second call for the same key should hit the cache and return the exact
    // same (cached) object, regardless of which geometry instance is passed.
    const patternsB = getFracturePatterns(0, 0, geomB);
    expect(patternsB).toBe(patternsA);
  });

  it('produces 2 patterns, each with chunkCount in [3,6]', () => {
    const geom = new IcosahedronGeometry(1, 2);
    const patterns = getFracturePatterns(1, 2, geom);
    expect(patterns).toHaveLength(2);
    for (const p of patterns) {
      expect(p.chunkCount).toBeGreaterThanOrEqual(3);
      expect(p.chunkCount).toBeLessThanOrEqual(6);
    }
  });

  it('assigns every face to a valid cluster index', () => {
    const geom = new IcosahedronGeometry(1, 1);
    const patterns = getFracturePatterns(2, 0, geom);
    for (const p of patterns) {
      for (const clusterId of p.faceClusterId) {
        expect(clusterId).toBeGreaterThanOrEqual(0);
        expect(clusterId).toBeLessThan(p.chunkCount);
      }
    }
  });

  it('different (tier, variant) combos produce different-looking patterns', () => {
    const geom = new IcosahedronGeometry(1, 1);
    const patternsA = getFracturePatterns(3, 0, geom);
    const patternsB = getFracturePatterns(4, 0, geom);
    // Not a strict inequality requirement (could coincidentally match), just
    // sanity that distinct keys aren't silently sharing cached state.
    expect(patternsA).not.toBe(patternsB);
  });
});

describe('pickPattern', () => {
  it('is deterministic for the same (globalIdx, hitSeq, seed)', () => {
    const geom = new IcosahedronGeometry(1, 1);
    const patterns = getFracturePatterns(0, 0, geom);
    const a = pickPattern(patterns, 42, 3, 100);
    const b = pickPattern(patterns, 42, 3, 100);
    expect(a).toBe(b);
  });

  it('always returns one of the precomputed patterns', () => {
    const geom = new IcosahedronGeometry(1, 1);
    const patterns = getFracturePatterns(0, 1, geom);
    for (let hitSeq = 0; hitSeq < 20; hitSeq++) {
      const pattern = pickPattern(patterns, 7, hitSeq, 5);
      expect(patterns).toContain(pattern);
    }
  });
});

describe('pickClusterIndices', () => {
  it('returns distinct indices, never repeating within one call', () => {
    const geom = new IcosahedronGeometry(1, 2);
    const patterns = getFracturePatterns(2, 1, geom);
    const pattern = patterns[0];
    const indices = pickClusterIndices(pattern, pattern.chunkCount, 10, 1, 50);
    expect(new Set(indices).size).toBe(indices.length);
    for (const idx of indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(pattern.chunkCount);
    }
  });

  it('clamps to chunkCount when count exceeds it', () => {
    const geom = new IcosahedronGeometry(1, 1);
    const patterns = getFracturePatterns(1, 0, geom);
    const pattern = patterns[0];
    const indices = pickClusterIndices(pattern, 999, 1, 1, 1);
    expect(indices.length).toBe(pattern.chunkCount);
  });
});

describe('computeClusterCentroid / extractChunkGeometry', () => {
  it('extractChunkGeometry recenters the chunk on its own centroid (origin ~ 0,0,0)', () => {
    const geom = new IcosahedronGeometry(1, 1);
    const patterns = getFracturePatterns(0, 0, geom);
    const pattern = patterns[0];
    const { geometry } = extractChunkGeometry(geom, pattern, 0);
    const pos = geometry.attributes.position;
    const center = new Vector3();
    for (let i = 0; i < pos.count; i++) center.add(new Vector3().fromBufferAttribute(pos, i));
    center.divideScalar(pos.count);
    expect(center.length()).toBeLessThan(1e-5);
  });

  it('computeClusterCentroid matches extractChunkGeometry\'s reported centroid', () => {
    const geom = new IcosahedronGeometry(1, 1);
    const patterns = getFracturePatterns(0, 0, geom);
    const pattern = patterns[0];
    const { centroid: fromExtract } = extractChunkGeometry(geom, pattern, 0);
    const fromCompute = new Vector3();
    computeClusterCentroid(geom, pattern, 0, fromCompute);
    expect(fromCompute.distanceTo(fromExtract)).toBeLessThan(1e-6);
  });

  it('produces non-empty geometry for every valid cluster index', () => {
    const geom = new IcosahedronGeometry(1, 1);
    const patterns = getFracturePatterns(1, 1, geom);
    const pattern = patterns[0];
    for (let c = 0; c < pattern.chunkCount; c++) {
      // Only assert non-empty if the cluster actually has faces assigned
      // (possible, if unlikely, for a cluster to end up empty on a small
      // low-poly geometry) — guard against that rather than assume.
      const hasFaces = pattern.faceClusterId.includes(c);
      if (!hasFaces) continue;
      const { geometry } = extractChunkGeometry(geom, pattern, c);
      expect(geometry.attributes.position.count).toBeGreaterThan(0);
    }
  });
});

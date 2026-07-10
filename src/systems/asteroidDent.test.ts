import { describe, expect, it } from 'vitest';
import { IcosahedronGeometry, Vector3 } from 'three';
import { applyDentToGeometry, DENT_RADIUS, MIN_RADIAL_FLOOR } from './asteroidDent';

function radiusOfVertex(geometry: IcosahedronGeometry, i: number): number {
  const pos = geometry.attributes.position;
  return new Vector3().fromBufferAttribute(pos, i).length();
}

describe('applyDentToGeometry', () => {
  it('only moves vertices within DENT_RADIUS of the impact point', () => {
    const geom = new IcosahedronGeometry(1, 1);
    const pos = geom.attributes.position;
    const before: number[] = [];
    for (let i = 0; i < pos.count; i++) before.push(radiusOfVertex(geom, i));

    // Impact point far outside the geometry — nothing should move.
    applyDentToGeometry(geom, new Vector3(100, 100, 100), 10);
    for (let i = 0; i < pos.count; i++) {
      expect(radiusOfVertex(geom, i)).toBeCloseTo(before[i], 5);
    }
  });

  it('pushes a vertex directly at the impact point inward, deeper with more damage', () => {
    const geom = new IcosahedronGeometry(1, 1);
    const pos = geom.attributes.position;
    const v0 = new Vector3().fromBufferAttribute(pos, 0);
    const before = v0.length();

    applyDentToGeometry(geom, v0.clone(), 1);
    const afterSmall = radiusOfVertex(geom as unknown as IcosahedronGeometry, 0);
    expect(afterSmall).toBeLessThan(before);

    const geom2 = new IcosahedronGeometry(1, 1);
    applyDentToGeometry(geom2, v0.clone(), 10);
    const afterBig = radiusOfVertex(geom2, 0);
    expect(afterBig).toBeLessThan(afterSmall);
  });

  it('falls off with distance — the exact impact vertex dents at least as much as any other in-range vertex', () => {
    const geom = new IcosahedronGeometry(1, 2);
    const pos = geom.attributes.position;
    const impact = new Vector3().fromBufferAttribute(pos, 0);

    const distances: number[] = [];
    const before: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      distances.push(new Vector3().fromBufferAttribute(pos, i).distanceTo(impact));
      before.push(radiusOfVertex(geom, i));
    }

    applyDentToGeometry(geom, impact, 5);

    const depthAt0 = before[0] - radiusOfVertex(geom, 0);
    expect(depthAt0).toBeGreaterThan(0);
    for (let i = 1; i < pos.count; i++) {
      if (distances[i] >= DENT_RADIUS) continue;
      const depth = before[i] - radiusOfVertex(geom, i);
      expect(depth).toBeLessThanOrEqual(depthAt0 + 1e-9);
    }
  });

  it('never collapses a vertex through MIN_RADIAL_FLOOR even with extreme repeated damage', () => {
    const geom = new IcosahedronGeometry(1, 1);
    const pos = geom.attributes.position;
    const impact = new Vector3().fromBufferAttribute(pos, 0);
    for (let i = 0; i < 50; i++) {
      applyDentToGeometry(geom, impact, 1000);
    }
    for (let i = 0; i < pos.count; i++) {
      expect(radiusOfVertex(geom, i)).toBeGreaterThanOrEqual(MIN_RADIAL_FLOOR - 1e-6);
    }
  });

  it('accumulates deeper dents on repeated hits in the same spot rather than undoing them', () => {
    const geom = new IcosahedronGeometry(1, 1);
    const pos = geom.attributes.position;
    const impact = new Vector3().fromBufferAttribute(pos, 0);
    const before = radiusOfVertex(geom, 0);
    applyDentToGeometry(geom, impact, 1);
    const afterFirst = radiusOfVertex(geom, 0);
    applyDentToGeometry(geom, impact, 1);
    const afterSecond = radiusOfVertex(geom, 0);
    expect(afterFirst).toBeLessThan(before);
    expect(afterSecond).toBeLessThan(afterFirst);
  });

  it('does not change vertex direction, only radial distance', () => {
    const geom = new IcosahedronGeometry(1, 1);
    const pos = geom.attributes.position;
    const impact = new Vector3().fromBufferAttribute(pos, 0);
    const beforeDir = new Vector3().fromBufferAttribute(pos, 0).normalize();
    applyDentToGeometry(geom, impact, 3);
    const afterDir = new Vector3().fromBufferAttribute(pos, 0).normalize();
    expect(afterDir.dot(beforeDir)).toBeCloseTo(1, 5);
  });
});

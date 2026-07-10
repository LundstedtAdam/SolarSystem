// Local impact-deformation for a promoted asteroid's individually-owned
// geometry. Reuses rockGeometry.ts's exact per-vertex-mutation recipe
// (mutate `position`, `computeVertexNormals()`) — just scoped to vertices
// near an impact point instead of applied uniformly to every vertex.

import { Vector3, type BufferGeometry } from 'three';

/** Local-space dent falloff radius, tuned against rockGeometry's ~1.0 nominal
 *  radius (proportional dents on small and large rocks alike, since every
 *  promoted mesh's geometry is unit-scale regardless of world size). */
export const DENT_RADIUS = 0.9;
export const DENT_DEPTH_PER_DAMAGE = 0.05;
/** Hard floor so repeated overlapping hits can't collapse a vertex through
 *  the core. */
export const MIN_RADIAL_FLOOR = 0.15;

const _v = new Vector3();
const _dir = new Vector3();

/**
 * Push every vertex within `DENT_RADIUS` of `localImpactPoint` inward along
 * its own outward direction, scaled by `amount` and a smooth (1-d/R)²
 * falloff, floored so a vertex can never collapse through the core. Reads
 * the geometry's *current* position each time (not a pristine snapshot), so
 * repeated hits in the same area accumulate correctly — direction is
 * invariant under this purely-radial displacement, so dents deepen rather
 * than drift or fight each other.
 */
export function applyDentToGeometry(geometry: BufferGeometry, localImpactPoint: Vector3, amount: number): void {
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i);
    const d = _v.distanceTo(localImpactPoint);
    if (d >= DENT_RADIUS) continue;
    const weight = (1 - d / DENT_RADIUS) ** 2;
    const len = _v.length();
    _dir.copy(_v).divideScalar(len || 1);
    const depth = amount * DENT_DEPTH_PER_DAMAGE * weight;
    const newLen = Math.max(len - depth, MIN_RADIAL_FLOOR);
    pos.setXYZ(i, _dir.x * newLen, _dir.y * newLen, _dir.z * newLen);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

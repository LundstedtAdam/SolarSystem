import { IcosahedronGeometry, Vector3, type BufferGeometry } from 'three/webgpu';

/** Lumpy, crack-free rock from an icosahedron: displace each vertex along its
 *  own direction by a smooth function of that direction, so shared seam
 *  vertices move identically. `seed` gives each variant a distinct shape.
 *  Shared by the asteroid belt and the debris pool (fragments reuse the
 *  cheapest, tier-0 detail level — no new GPU geometry work per fracture). */
export function rockGeometry(detail: number, seed: number): BufferGeometry {
  const g = new IcosahedronGeometry(1, detail);
  const pos = g.attributes.position;
  const v = new Vector3();
  const amp = 0.38;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const lump =
      Math.sin(v.x * 3.1 + seed * 1.3) *
      Math.sin(v.y * 3.7 + seed * 2.1) *
      Math.sin(v.z * 2.9 + seed * 0.7);
    const f = 1 + amp * lump;
    pos.setXYZ(i, v.x * f, v.y * f, v.z * f);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

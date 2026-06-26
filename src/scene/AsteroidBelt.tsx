import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  InstancedMesh,
  IcosahedronGeometry,
  MeshStandardNodeMaterial,
  Matrix4,
  Quaternion,
  Vector3,
  Euler,
  type BufferGeometry,
  type Group,
} from 'three/webgpu';
import { vec3, float } from 'three/tsl';
import { useStore } from '../store';
import { QUALITY } from '../systems/quality';

// Belt sits between Mars (render dist ~620) and Jupiter (~950), centered ~700,
// kept inside Jupiter's inner moon shell (~762) so nothing crosses orbits.
const INNER = 645;
const OUTER = 755;
const THICKNESS = 16; // full vertical spread; concentrated toward the plane

/**
 * Size/detail tiers — a realistic belt is mostly dust with a few large bodies.
 * Geometry detail (poly count) scales with size so the big rocks that read up
 * close are high-poly, while the abundant tiny ones stay cheap. Only the
 * larger, visibly-tumbling tiers animate per frame, keeping the cost low.
 */
const TIERS = [
  { frac: 0.78, detail: 0, min: 0.12, max: 0.5, variants: 1, rotates: false },
  { frac: 0.18, detail: 1, min: 0.5, max: 1.9, variants: 2, rotates: true },
  { frac: 0.04, detail: 2, min: 1.9, max: 5.2, variants: 3, rotates: true },
] as const;

/** Lumpy, crack-free rock from an icosahedron: displace each vertex along its
 *  own direction by a smooth function of that direction, so shared seam
 *  vertices move identically. `seed` gives each variant a distinct shape. */
function rockGeometry(detail: number, seed: number): BufferGeometry {
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

interface RotItem {
  pos: Vector3;
  scale: Vector3;
  axis: Vector3;
  speed: number;
  phase: number;
}
interface BeltMesh {
  inst: InstancedMesh;
  rotates: boolean;
  items: RotItem[];
}

/**
 * Asteroid belt rendered as a handful of InstancedMeshes (a few draw calls for
 * thousands of rocks), split into size/detail tiers for natural variety and
 * level of detail. The belt drifts slowly on the sim clock; the larger rocks
 * also tumble individually. Instance count scales with the quality preset.
 */
export function AsteroidBelt() {
  const count = QUALITY[useStore((s) => s.quality)].asteroids;
  const group = useRef<Group>(null);

  const built = useMemo(() => {
    if (count === 0) return null;

    const material = new MeshStandardNodeMaterial();
    material.colorNode = vec3(0.44, 0.41, 0.37);
    material.roughnessNode = float(1);
    material.metalnessNode = float(0);

    const meshes: BeltMesh[] = [];
    const geometries: BufferGeometry[] = [];
    const m = new Matrix4();
    const q = new Quaternion();
    const e = new Euler();

    for (const tier of TIERS) {
      const tierCount = Math.round(count * tier.frac);
      if (tierCount === 0) continue;
      // Split this tier's rocks across its shape variants.
      for (let vi = 0; vi < tier.variants; vi++) {
        const n =
          Math.floor(tierCount / tier.variants) +
          (vi < tierCount % tier.variants ? 1 : 0);
        if (n === 0) continue;
        const geom = rockGeometry(tier.detail, vi * 7 + tier.detail * 13 + 1);
        geometries.push(geom);
        const inst = new InstancedMesh(geom, material, n);
        inst.frustumCulled = false; // ring is essentially always partly on-screen
        const items: RotItem[] = [];
        for (let i = 0; i < n; i++) {
          const angle = Math.random() * Math.PI * 2;
          const r = INNER + Math.random() * (OUTER - INNER);
          // concentrate toward the orbital plane (rand*rand bias)
          const y = (Math.random() - 0.5) * (Math.random() ** 2) * THICKNESS;
          const pos = new Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r);
          const base = tier.min + Math.random() * (tier.max - tier.min);
          // irregular, non-uniform scale so rocks aren't spheres
          const scale = new Vector3(
            base,
            base * (0.6 + Math.random() * 0.7),
            base * (0.7 + Math.random() * 0.6)
          );
          e.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
          q.setFromEuler(e);
          m.compose(pos, q, scale);
          inst.setMatrixAt(i, m);
          if (tier.rotates) {
            const axis = new Vector3(
              Math.random() - 0.5,
              Math.random() - 0.5,
              Math.random() - 0.5
            ).normalize();
            items.push({ pos, scale, axis, speed: 0.05 + Math.random() * 0.25, phase: Math.random() * Math.PI * 2 });
          }
        }
        inst.instanceMatrix.needsUpdate = true;
        meshes.push({ inst, rotates: tier.rotates, items });
      }
    }
    return { meshes, geometries, material };
  }, [count]);

  // Free GPU resources on quality change / unmount.
  useEffect(() => {
    return () => {
      if (!built) return;
      built.meshes.forEach((bm) => bm.inst.dispose());
      built.geometries.forEach((g) => g.dispose());
      built.material.dispose();
    };
  }, [built]);

  // Reused scratch objects for the per-frame tumble update.
  const scratch = useRef({ m: new Matrix4(), q: new Quaternion() });

  useFrame((state) => {
    if (!built) return;
    // Whole-belt orbital drift (respects sim time scale / pause).
    if (group.current) group.current.rotation.y = useStore.getState().simTimeDays * 0.0009;
    // Individual tumble for the larger tiers (continues regardless of pause).
    const t = state.clock.elapsedTime;
    const { m, q } = scratch.current;
    for (const bm of built.meshes) {
      if (!bm.rotates) continue;
      for (let i = 0; i < bm.items.length; i++) {
        const it = bm.items[i];
        q.setFromAxisAngle(it.axis, it.phase + t * it.speed);
        m.compose(it.pos, q, it.scale);
        bm.inst.setMatrixAt(i, m);
      }
      bm.inst.instanceMatrix.needsUpdate = true;
    }
  });

  if (!built) return null;
  return (
    <group ref={group}>
      {built.meshes.map((bm, i) => (
        <primitive key={i} object={bm.inst} />
      ))}
    </group>
  );
}

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  InstancedMesh,
  IcosahedronGeometry,
  MeshStandardNodeMaterial,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Group,
} from 'three/webgpu';
import { vec3, float } from 'three/tsl';
import { useStore } from '../store';
import { QUALITY } from '../systems/quality';
import { TIERS, BELT_SEED, placeAsteroid } from '../systems/asteroidLayout';

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

    for (let tierIdx = 0; tierIdx < TIERS.length; tierIdx++) {
      const tier = TIERS[tierIdx];
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
          // Deterministic placement — see asteroidLayout.ts. Index `i` always
          // resolves to the same rock regardless of quality tier.
          const placed = placeAsteroid(tierIdx, vi, i, BELT_SEED);
          m.compose(placed.pos, placed.quat, placed.scale);
          inst.setMatrixAt(i, m);
          if (tier.rotates && placed.tumbleAxis) {
            items.push({
              pos: placed.pos,
              scale: placed.scale,
              axis: placed.tumbleAxis,
              speed: placed.tumbleSpeed!,
              phase: placed.tumblePhase!,
            });
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

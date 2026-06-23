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
  type Material,
  type Group,
} from 'three/webgpu';
import { vec3, float } from 'three/tsl';
import { useStore } from '../store';
import { QUALITY } from '../systems/quality';

// Belt sits between Mars (render dist 170) and Jupiter (230).
const INNER = 184;
const OUTER = 222;

/**
 * Asteroid belt as a single InstancedMesh (one draw call for thousands of
 * rocks). The whole belt rotates slowly on the sim clock; instance count scales
 * with the quality preset.
 */
export function AsteroidBelt() {
  const count = QUALITY[useStore((s) => s.quality)].asteroids;
  const group = useRef<Group>(null);

  const mesh = useMemo(() => {
    if (count === 0) return null;
    const geometry = new IcosahedronGeometry(1, 0); // low-poly rock
    const material = new MeshStandardNodeMaterial();
    material.colorNode = vec3(0.42, 0.4, 0.37);
    material.roughnessNode = float(1);
    material.metalnessNode = float(0);

    const inst = new InstancedMesh(geometry, material, count);
    const m = new Matrix4();
    const q = new Quaternion();
    const p = new Vector3();
    const s = new Vector3();
    const e = new Euler();
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = INNER + Math.random() * (OUTER - INNER);
      const y = (Math.random() - 0.5) * 6;
      p.set(Math.cos(angle) * r, y, Math.sin(angle) * r);
      e.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      q.setFromEuler(e);
      const sc = 0.3 + Math.random() * Math.random() * 1.4; // mostly small, a few larger
      s.set(sc, sc * (0.7 + Math.random() * 0.6), sc);
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false; // belt spans the whole ring; never fully off-screen
    return inst;
  }, [count]);

  // Free GPU resources on quality change / unmount.
  useEffect(() => {
    return () => {
      if (mesh) {
        mesh.geometry.dispose();
        (mesh.material as Material).dispose();
      }
    };
  }, [mesh]);

  useFrame(() => {
    if (group.current) group.current.rotation.y = useStore.getState().simTimeDays * 0.0015;
  });

  if (!mesh) return null;
  return (
    <group ref={group}>
      <primitive object={mesh} />
    </group>
  );
}

import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { InstancedMesh, MeshStandardMaterial, Matrix4, Vector3, Color, type Material } from 'three/webgpu';
import { useStore } from '../store';
import { QUALITY } from '../systems/quality';
import { updateDebrisBodies } from '../systems/debrisPhysics';
import { debrisRuntime } from './debrisRuntime';
import { shipTelemetry } from '../ship/shipTelemetry';
import { rockGeometry } from './rockGeometry';

const _m = new Matrix4();
const _scale = new Vector3();
const _zero = new Matrix4().makeScale(0, 0, 0);
const _rockColor = new Color(0.4, 0.37, 0.33);
const _oreColor = new Color(0.75, 0.62, 0.25);

/**
 * Pooled debris/ore-chunk fragments spawned by asteroid fracture (and,
 * later, space mining). One shared InstancedMesh, hard-capped by
 * `QUALITY[...].debrisMax`, following the exact swap-remove + scale-to-zero
 * pooling pattern already used for voxel mining debris
 * (`ChunkManager.tsx`'s `Debris[]`/`updateDebris`) — reuses the belt's
 * cheapest (tier-0) rock geometry rather than building new GPU resources.
 */
export function AsteroidDebris() {
  const q = QUALITY[useStore((s) => s.quality)];
  const sceneModeType = useStore((s) => s.sceneMode.type);

  const built = useMemo(() => {
    if (q.debrisMax === 0) return null;
    const geometry = rockGeometry(0, 999);
    const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
    const inst = new InstancedMesh(geometry, material, q.debrisMax);
    inst.frustumCulled = false;
    return { inst, geometry, material };
  }, [q.debrisMax]);

  // Publish current quality budgets to the runtime singleton and drop any
  // fragments beyond a shrunk cap when quality is lowered mid-flight.
  useEffect(() => {
    debrisRuntime.maxCount = q.debrisMax;
    debrisRuntime.maxLifeSec = q.debrisLifetimeSec;
    debrisRuntime.cullDistance = q.debrisCullDistance;
    if (debrisRuntime.list.length > q.debrisMax) {
      debrisRuntime.list.length = q.debrisMax;
    }
  }, [q.debrisMax, q.debrisLifetimeSec, q.debrisCullDistance]);

  useEffect(() => {
    return () => {
      if (!built) return;
      built.inst.dispose();
      built.geometry.dispose();
      (built.material as Material).dispose();
    };
  }, [built]);

  useFrame((_, delta) => {
    if (!built) return;
    if (sceneModeType !== 'piloting') return;
    const dt = Math.min(delta, 0.05);
    const store = useStore.getState();
    updateDebrisBodies(
      debrisRuntime.list,
      dt,
      store.simTimeDays,
      shipTelemetry.position,
      debrisRuntime.maxLifeSec,
      debrisRuntime.cullDistance,
    );

    const list = debrisRuntime.list;
    const inst = built.inst;
    for (let i = 0; i < q.debrisMax; i++) {
      const d = list[i];
      if (d) {
        _scale.set(d.radius, d.radius, d.radius);
        _m.compose(d.pos, d.quat, _scale);
        inst.setMatrixAt(i, _m);
        inst.setColorAt(i, d.isOre ? _oreColor : _rockColor);
      } else {
        inst.setMatrixAt(i, _zero);
      }
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  });

  if (!built) return null;
  return <primitive object={built.inst} />;
}

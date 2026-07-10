import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { InstancedMesh, CylinderGeometry, MeshBasicMaterial, Matrix4, Vector3, Quaternion, AdditiveBlending } from 'three/webgpu';
import { useStore } from '../store';
import { QUALITY } from '../systems/quality';
import { updateProjectiles } from '../systems/projectilePhysics';
import { projectileRuntime } from './projectileRuntime';
import { shipTelemetry } from '../ship/shipTelemetry';
import { MINING_RANGE } from '../ship/spaceMining';

const _m = new Matrix4();
const _scale = new Vector3();
const _quat = new Quaternion();
const _up = new Vector3(0, 1, 0);
const _dirNorm = new Vector3();

/** Rendered bolt radius/length — a short visible tracer, not the full flight
 *  path (the *travel* is what the projectile's own per-frame motion shows). */
const BOLT_RADIUS = 0.05;
const BOLT_LENGTH = 1.4;

/**
 * Pooled weapon-projectile visuals — one shared InstancedMesh, hard-capped by
 * `QUALITY[...].projectileMax`, following the same pooling convention as
 * `AsteroidDebris.tsx`/`MiningSparks.tsx`. Each instance is a thin cylinder
 * oriented along its own velocity (same "align a mesh to a direction via
 * `setFromUnitVectors`" technique as `SpaceMiningController.tsx`'s tracer
 * flash), so a shot visibly flies from the ship to whatever it strikes.
 */
export function Projectiles() {
  const q = QUALITY[useStore((s) => s.quality)];
  const sceneModeType = useStore((s) => s.sceneMode.type);

  const built = useMemo(() => {
    if (q.projectileMax === 0) return null;
    const geometry = new CylinderGeometry(BOLT_RADIUS, BOLT_RADIUS, 1, 6, 1, true);
    const material = new MeshBasicMaterial({
      color: 0xff8850,
      transparent: true,
      opacity: 0.9,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const inst = new InstancedMesh(geometry, material, q.projectileMax);
    inst.frustumCulled = false;
    inst.count = 0;
    return { inst, geometry, material };
  }, [q.projectileMax]);

  useEffect(() => {
    projectileRuntime.maxCount = q.projectileMax;
    if (projectileRuntime.list.length > q.projectileMax) {
      projectileRuntime.list.length = q.projectileMax;
    }
  }, [q.projectileMax]);

  useEffect(() => {
    return () => {
      if (!built) return;
      built.inst.dispose();
      built.geometry.dispose();
      built.material.dispose();
    };
  }, [built]);

  useFrame((_, delta) => {
    if (!built) return;
    if (sceneModeType !== 'piloting') return;
    const dt = Math.min(delta, 0.05);
    const store = useStore.getState();
    updateProjectiles(projectileRuntime.list, dt, store.simTimeDays, shipTelemetry.position, MINING_RANGE);

    const list = projectileRuntime.list;
    const inst = built.inst;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      _dirNorm.copy(p.vel).normalize();
      _scale.set(1, BOLT_LENGTH, 1);
      _quat.setFromUnitVectors(_up, _dirNorm);
      _m.compose(p.pos, _quat, _scale);
      inst.setMatrixAt(i, _m);
    }
    inst.count = list.length;
    inst.instanceMatrix.needsUpdate = true;
  });

  if (!built) return null;
  return <primitive object={built.inst} />;
}

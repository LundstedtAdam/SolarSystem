// Hot-path singleton for the pooled weapon-projectile population — same
// convention as `debrisRuntime.ts`/`miningSparkRuntime.ts`: plain mutable
// data, no store subscription. `Projectiles.tsx` owns the InstancedMesh and
// integrates/renders this list every frame; `SpaceMiningController.tsx` is the
// only writer via `spawn()`.

import { Vector3 } from 'three/webgpu';
import { PROJECTILE_RADIUS } from '../ship/spaceMining';

export interface ProjectileBody {
  pos: Vector3;
  vel: Vector3;
  life: number;
  radius: number;
}

export interface ProjectileSpawnSpec {
  pos: Vector3;
  vel: Vector3;
}

export const projectileRuntime: {
  list: ProjectileBody[];
  /** Set by Projectiles.tsx from QUALITY[...].projectileMax each render. */
  maxCount: number;
  spawn: (spec: ProjectileSpawnSpec) => void;
} = {
  list: [],
  maxCount: 0,
  spawn(spec) {
    if (projectileRuntime.list.length >= projectileRuntime.maxCount) return;
    projectileRuntime.list.push({
      pos: spec.pos.clone(),
      vel: spec.vel.clone(),
      life: 0,
      radius: PROJECTILE_RADIUS,
    });
  },
};

// Hot-path singleton for the pooled debris/ore-chunk population spawned by
// asteroid fracture (and, later, space mining) — same convention as
// `shipTelemetry.ts`/`asteroidRuntime.ts`: plain mutable data, no store
// subscription. `AsteroidDebris.tsx` owns the InstancedMesh and integrates
// this list every frame; `asteroidFracture.ts` and (eventually) the mining
// system are the only writers via `spawn()`.

import { Vector3 } from 'three/webgpu';
import type { ResourceType } from '../voxel/voxelTypes';

export interface DebrisBody {
  pos: Vector3;
  vel: Vector3;
  radius: number;
  life: number;
  isOre: boolean;
  resourceType?: ResourceType;
}

export interface DebrisSpawnSpec {
  pos: Vector3;
  vel: Vector3;
  radius: number;
  isOre?: boolean;
  resourceType?: ResourceType;
}

export const debrisRuntime: {
  list: DebrisBody[];
  /** Set by AsteroidDebris.tsx from QUALITY[...].debrisMax each render. */
  maxCount: number;
  /** Set by AsteroidDebris.tsx from QUALITY[...].debrisLifetimeSec. */
  maxLifeSec: number;
  /** Set by AsteroidDebris.tsx from QUALITY[...].debrisCullDistance. */
  cullDistance: number;
  spawn: (spec: DebrisSpawnSpec) => void;
} = {
  list: [],
  maxCount: 0,
  maxLifeSec: 12,
  cullDistance: 400,
  spawn(spec) {
    if (debrisRuntime.list.length >= debrisRuntime.maxCount) return;
    debrisRuntime.list.push({
      pos: spec.pos.clone(),
      vel: spec.vel.clone(),
      radius: spec.radius,
      life: 0,
      isOre: spec.isOre ?? false,
      resourceType: spec.resourceType,
    });
  },
};

// Hot-path singleton for the pooled debris/ore-chunk population spawned by
// asteroid fracture (and, later, space mining) — same convention as
// `shipTelemetry.ts`/`asteroidRuntime.ts`: plain mutable data, no store
// subscription. `AsteroidDebris.tsx` owns the InstancedMesh and integrates
// this list every frame; `asteroidFracture.ts` and (eventually) the mining
// system are the only writers via `spawn()`.

import { Quaternion, Vector3 } from 'three/webgpu';
import type { ResourceType } from '../voxel/voxelTypes';

export interface DebrisBody {
  pos: Vector3;
  vel: Vector3;
  quat: Quaternion;
  /** rad/s, world-space axis*rate — integrated each frame in debrisPhysics.ts. */
  angVel: Vector3;
  radius: number;
  life: number;
  isOre: boolean;
  resourceType?: ResourceType;
  /** 0 for fracture-spawned fragments, 1 for a cascade "chip" spawned off a
   *  hard collision — chips never re-trigger a further cascade (hard depth
   *  cap, see debrisPhysics.ts). */
  cascadeDepth: number;
  /** Which extracted chunk shape this fragment is, if it came from
   *  pattern-based fracture (see asteroidFracturePatterns.ts) — lets
   *  AsteroidDebris.tsx render it in a bucket matching its actual shape
   *  instead of a generic rock. Undefined for the jitter-only fallback path
   *  and for cascade chips, which render as a generic rock. */
  shapeKey?: DebrisShapeKey;
}

export interface DebrisShapeKey {
  tierIdx: number;
  variantIdx: number;
  patternIdx: number;
  clusterIdx: number;
}

export interface DebrisSpawnSpec {
  pos: Vector3;
  vel: Vector3;
  radius: number;
  isOre?: boolean;
  resourceType?: ResourceType;
  /** Defaults to identity/zero if omitted (e.g. cosmetic-only callers). */
  quat?: Quaternion;
  angVel?: Vector3;
  cascadeDepth?: number;
  shapeKey?: DebrisShapeKey;
  /** Initial `life` value (seconds already "lived") — lets short-lived spawns
   *  (per-hit impact chips) expire well before the global `maxLifeSec`
   *  without a second lifetime field, so they can't starve the pool budget
   *  that real fracture fragments draw from. */
  life?: number;
}

export const debrisRuntime: {
  list: DebrisBody[];
  /** Set by AsteroidDebris.tsx from QUALITY[...].debrisMax each render. */
  maxCount: number;
  /** Set by AsteroidDebris.tsx from QUALITY[...].debrisLifetimeSec. */
  maxLifeSec: number;
  /** Set by AsteroidDebris.tsx from QUALITY[...].debrisCullDistance. */
  cullDistance: number;
  /** Set by AsteroidDebris.tsx from QUALITY[...].cascadeFractureEnabled —
   *  gates whether a hard-enough bounce chips off secondary fragments
   *  (debrisPhysics.ts). Debris still always bounces regardless (cheap
   *  reflection math); this only gates the extra population growth from
   *  cascade chips on low-end tiers. */
  cascadeEnabled: boolean;
  spawn: (spec: DebrisSpawnSpec) => void;
} = {
  list: [],
  maxCount: 0,
  maxLifeSec: 12,
  cullDistance: 400,
  cascadeEnabled: true,
  spawn(spec) {
    if (debrisRuntime.list.length >= debrisRuntime.maxCount) return;
    debrisRuntime.list.push({
      pos: spec.pos.clone(),
      vel: spec.vel.clone(),
      quat: spec.quat ? spec.quat.clone() : new Quaternion(),
      angVel: spec.angVel ? spec.angVel.clone() : new Vector3(),
      radius: spec.radius,
      life: spec.life ?? 0,
      isOre: spec.isOre ?? false,
      resourceType: spec.resourceType,
      cascadeDepth: spec.cascadeDepth ?? 0,
      shapeKey: spec.shapeKey,
    });
  },
};

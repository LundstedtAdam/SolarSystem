// Hot-path singleton for the pooled impact-chip spark population — the
// small, purely cosmetic burst spawned on every shot that connects,
// regardless of whether the hit fractures anything. Kept separate from
// `debrisRuntime.ts`'s pool: sparks are far more frequent (one burst per
// shot, every hit) but far cheaper/shorter-lived than real fracture debris,
// and shouldn't compete with that pool's budget.

import { Vector3 } from 'three/webgpu';

export interface SparkParticle {
  pos: Vector3;
  vel: Vector3;
  life: number;
  maxLife: number;
}

export const miningSparkRuntime: {
  list: SparkParticle[];
  /** Set by MiningSparks.tsx from QUALITY[...].miningVfxBudget each render. */
  maxCount: number;
  spawn: (point: Vector3, count: number) => void;
} = {
  list: [],
  maxCount: 0,
  spawn(point, count) {
    for (let i = 0; i < count; i++) {
      if (miningSparkRuntime.list.length >= miningSparkRuntime.maxCount) return;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const speed = 1.5 + Math.random() * 2.5;
      miningSparkRuntime.list.push({
        pos: point.clone(),
        vel: new Vector3(Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi)).multiplyScalar(
          speed,
        ),
        life: 0,
        maxLife: 0.15 + Math.random() * 0.15,
      });
    }
  },
};

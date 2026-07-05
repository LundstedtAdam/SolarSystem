import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  InstancedMesh,
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
import { TIERS, BELT_SEED, computeTierVariantCounts, placeAsteroid } from '../systems/asteroidLayout';
import { buildAsteroidStates } from '../systems/asteroidState';
import { buildAsteroidGrid, removeFromGrid } from '../systems/asteroidGrid';
import { asteroidRuntime } from './asteroidRuntime';
import { rockGeometry } from './rockGeometry';

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
  /** First `asteroidRuntime.states` index covered by this mesh — instance
   *  index `i` corresponds to global state index `globalOffset + i`. */
  globalOffset: number;
}

const _zeroScale = new Matrix4().makeScale(0, 0, 0);

/** Per-frame (@60fps) velocity retention for impact-knockback drift — settles
 *  a hit rock back to rest within a couple of seconds rather than drifting
 *  indefinitely. Below this squared speed, velocity snaps to exactly zero. */
const KNOCKBACK_DAMPING = 0.9;
const KNOCKBACK_MIN_VEL_SQ = 1e-4;

/**
 * Asteroid belt rendered as a handful of InstancedMeshes (a few draw calls for
 * thousands of rocks), split into size/detail tiers for natural variety and
 * level of detail. The belt drifts slowly on the sim clock; the larger rocks
 * also tumble individually. Instance count scales with the quality preset.
 *
 * Alongside the render matrices, builds the parallel per-asteroid state array
 * and spatial grid (`asteroidState.ts`/`asteroidGrid.ts`) and publishes them
 * on the `asteroidRuntime` singleton for ship collision/mining/fracture code
 * to read every frame without subscribing to this component.
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

    // Single source of truth for which (tier, variant) groups exist and how
    // many instances each has — shared with `buildAsteroidStates` below so
    // the render loop's running global-index counter and the state array's
    // indices agree without either side passing data to the other. Built
    // first (not after, as before) so the render loop below can share the
    // exact same position Vector3 with each state — impact-knockback physics
    // mutates `state.pos` in place, and the tumble loop renders whatever
    // `pos` its RotItem holds, so sharing the object means drift is rendered
    // automatically with no separate update path.
    const groups = computeTierVariantCounts(count);
    const states = buildAsteroidStates(count);
    let globalOffset = 0;

    for (const g of groups) {
      const tier = TIERS[g.tierIdx];
      const geom = rockGeometry(tier.detail, g.variantIdx * 7 + tier.detail * 13 + 1);
      geometries.push(geom);
      const inst = new InstancedMesh(geom, material, g.n);
      inst.frustumCulled = false; // ring is essentially always partly on-screen
      const items: RotItem[] = [];
      for (let i = 0; i < g.n; i++) {
        // Deterministic placement — see asteroidLayout.ts. Index `i` always
        // resolves to the same rock regardless of quality tier.
        const placed = placeAsteroid(g.tierIdx, g.variantIdx, i, BELT_SEED);
        const statePos = states[globalOffset + i].pos;
        m.compose(statePos, placed.quat, placed.scale);
        inst.setMatrixAt(i, m);
        if (tier.rotates && placed.tumbleAxis) {
          items.push({
            pos: statePos, // shared with AsteroidState — see note above
            scale: placed.scale,
            axis: placed.tumbleAxis,
            speed: placed.tumbleSpeed!,
            phase: placed.tumblePhase!,
          });
        }
      }
      inst.instanceMatrix.needsUpdate = true;
      meshes.push({ inst, rotates: tier.rotates, items, globalOffset });
      globalOffset += g.n;
    }

    const grid = buildAsteroidGrid(states);

    return { meshes, geometries, material, states, grid };
  }, [count]);

  // Publish to the runtime singleton (ship collision / mining / fracture read
  // it every frame) and wire the kill callback fracture/mining code uses to
  // zero a dead asteroid's render instance and drop it from the grid.
  useEffect(() => {
    if (!built) {
      asteroidRuntime.states = [];
      asteroidRuntime.grid = null;
      asteroidRuntime.killAsteroid = null;
      return;
    }
    asteroidRuntime.states = built.states;
    asteroidRuntime.grid = built.grid;
    asteroidRuntime.killAsteroid = (globalIdx: number) => {
      const state = built.states[globalIdx];
      if (!state || !state.alive) return;
      const mesh = built.meshes.find(
        (bm) => globalIdx >= bm.globalOffset && globalIdx < bm.globalOffset + bm.inst.count,
      );
      if (mesh) {
        mesh.inst.setMatrixAt(globalIdx - mesh.globalOffset, _zeroScale);
        mesh.inst.instanceMatrix.needsUpdate = true;
      }
      if (built.grid) removeFromGrid(built.grid, globalIdx, state.pos.x, state.pos.z);
      state.alive = false;
    };
    return () => {
      asteroidRuntime.states = [];
      asteroidRuntime.grid = null;
      asteroidRuntime.killAsteroid = null;
    };
  }, [built]);

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

  useFrame((state, delta) => {
    if (!built) return;
    // Whole-belt orbital drift (respects sim time scale / pause). Published
    // to the runtime so ship/debris code can transform world-space queries
    // into the belt-local space the grid is indexed in.
    const yaw = useStore.getState().simTimeDays * 0.0009;
    if (group.current) group.current.rotation.y = yaw;
    asteroidRuntime.groupYaw = yaw;
    // Individual tumble for the larger tiers (continues regardless of pause).
    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;
    const { m, q } = scratch.current;
    for (const bm of built.meshes) {
      if (!bm.rotates) continue;
      for (let i = 0; i < bm.items.length; i++) {
        const it = bm.items[i];
        const globalIdx = bm.globalOffset + i;
        const s = built.states[globalIdx];
        if (!s?.alive) continue; // fractured — stays zero-scaled

        // Impact-knockback drift: `it.pos` and `s.pos` are the same Vector3
        // (see the build loop above), so integrating here is all rendering
        // needs — no separate update path for hit asteroids.
        if (s.vel.lengthSq() > KNOCKBACK_MIN_VEL_SQ) {
          s.pos.addScaledVector(s.vel, dt);
          s.vel.multiplyScalar(KNOCKBACK_DAMPING ** (dt * 60));
        } else if (s.vel.x !== 0 || s.vel.y !== 0 || s.vel.z !== 0) {
          s.vel.set(0, 0, 0); // snap to rest once negligible
        }

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

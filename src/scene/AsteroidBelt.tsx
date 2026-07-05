import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  InstancedMesh,
  Mesh,
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
import { applyDentToGeometry } from '../systems/asteroidDent';

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

/** A hit asteroid pulled out of its shared InstancedMesh into a standalone,
 *  individually deformable Mesh (see the promotion API below). `mesh.position`
 *  is synced from the corresponding `AsteroidState.pos` every frame (the
 *  existing knockback-drift integration in the tumble loop keeps mutating
 *  that shared Vector3; `Object3D.position` can't alias it directly since
 *  three.js declares it read-only) — spin gets its own integration here,
 *  since promoted asteroids leave the clock-based tumble formula behind for a
 *  real integrated quaternion (the momentum formula for fragment velocity
 *  reads `angVel`). */
interface PromotedEntry {
  mesh: Mesh;
  geometry: BufferGeometry;
  angVel: Vector3;
  quat: Quaternion;
}

const _zeroScale = new Matrix4().makeScale(0, 0, 0);

/** Per-frame (@60fps) velocity retention for impact-knockback drift — settles
 *  a hit rock back to rest within a couple of seconds rather than drifting
 *  indefinitely. Below this squared speed, velocity snaps to exactly zero. */
const KNOCKBACK_DAMPING = 0.9;
const KNOCKBACK_MIN_VEL_SQ = 1e-4;

const _dentLocalPoint = new Vector3();
const _promoteQ = new Quaternion();
const _spinAxis = new Vector3();
const _spinDeltaQ = new Quaternion();

/**
 * Asteroid belt rendered as a handful of InstancedMeshes (a few draw calls for
 * thousands of rocks), split into size/detail tiers for natural variety and
 * level of detail. The belt drifts slowly on the sim clock; the larger rocks
 * also tumble individually. Instance count scales with the quality preset.
 *
 * Alongside the render matrices, builds the parallel per-asteroid state array
 * and spatial grid (`asteroidState.ts`/`asteroidGrid.ts`) and publishes them
 * on the `asteroidRuntime` singleton for ship collision/mining/fracture code
 * to read every frame without subscribing to this component. Also owns the
 * "promotion" mechanism (`asteroidRuntime.promotion`) that pulls a hit
 * asteroid out of its shared InstancedMesh into a standalone, individually
 * deformable mesh — real per-vertex local damage instead of delete+replace.
 */
export function AsteroidBelt() {
  const quality = useStore((s) => s.quality);
  const count = QUALITY[quality].asteroids;
  const promotedMax = QUALITY[quality].promotedAsteroidMax;
  const group = useRef<Group>(null);

  const built = useMemo(() => {
    if (count === 0) return null;

    const material = new MeshStandardNodeMaterial();
    material.colorNode = vec3(0.44, 0.41, 0.37);
    material.roughnessNode = float(1);
    material.metalnessNode = float(0);

    const meshes: BeltMesh[] = [];
    const geometryByKey = new Map<string, BufferGeometry>();
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
      geometryByKey.set(`${g.tierIdx}:${g.variantIdx}`, geom);
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
    const promoted = new Map<number, PromotedEntry>();

    return { meshes, geometryByKey, material, states, grid, promoted };
  }, [count]);

  /** Zero a live instance's render matrix (renders nothing) — shared by both
   *  the kill path and the promotion path (promotion hides the instanced
   *  copy in favor of the new standalone mesh, without touching `alive`). */
  function hideInstance(globalIdx: number) {
    if (!built) return;
    const mesh = built.meshes.find(
      (bm) => globalIdx >= bm.globalOffset && globalIdx < bm.globalOffset + bm.inst.count,
    );
    if (mesh) {
      mesh.inst.setMatrixAt(globalIdx - mesh.globalOffset, _zeroScale);
      mesh.inst.instanceMatrix.needsUpdate = true;
    }
  }

  // Publish to the runtime singleton (ship collision / mining / fracture read
  // it every frame) and wire the kill callback + promotion API fracture/
  // mining code uses.
  useEffect(() => {
    if (!built) {
      asteroidRuntime.states = [];
      asteroidRuntime.grid = null;
      asteroidRuntime.killAsteroid = null;
      asteroidRuntime.promotion = null;
      return;
    }
    asteroidRuntime.states = built.states;
    asteroidRuntime.grid = built.grid;
    asteroidRuntime.killAsteroid = (globalIdx: number) => {
      const state = built.states[globalIdx];
      if (!state || !state.alive) return;
      hideInstance(globalIdx);
      if (built.grid) removeFromGrid(built.grid, globalIdx, state.pos.x, state.pos.z);
      state.alive = false;
      const entry = built.promoted.get(globalIdx);
      if (entry) {
        group.current?.remove(entry.mesh);
        entry.geometry.dispose();
        built.promoted.delete(globalIdx);
      }
    };
    asteroidRuntime.promotion = {
      promote: (globalIdx: number): boolean => {
        if (built.promoted.has(globalIdx)) return true;
        if (built.promoted.size >= promotedMax) return false;
        const state = built.states[globalIdx];
        if (!state || !state.alive) return false;
        const tier = TIERS[state.tierIdx];
        if (!tier.rotates) return false; // dust: too small/numerous to matter visually
        const baseGeom = built.geometryByKey.get(`${state.tierIdx}:${state.variantIdx}`);
        const mesh = built.meshes.find(
          (bm) => globalIdx >= bm.globalOffset && globalIdx < bm.globalOffset + bm.inst.count,
        );
        if (!baseGeom || !mesh) return false;
        const it = mesh.items[globalIdx - mesh.globalOffset];
        if (!it) return false;

        const geometry = baseGeom.clone();
        _promoteQ.setFromAxisAngle(it.axis, it.phase); // current tumble angle approximation at promotion time
        const obj = new Mesh(geometry, built.material);
        // Synced from `state.pos` every frame in the promoted-entry loop
        // below (Object3D.position is read-only, can't share the Vector3
        // instance the way RotItem.pos does for InstancedMesh items).
        obj.position.copy(state.pos);
        obj.quaternion.copy(_promoteQ);
        obj.scale.copy(it.scale);

        hideInstance(globalIdx);
        const angVel = it.axis.clone().multiplyScalar(it.speed);
        built.promoted.set(globalIdx, { mesh: obj, geometry, angVel, quat: _promoteQ.clone() });
        // `state.promoted` itself is set by the caller (asteroidFracture.ts)
        // based on this function's return value — single source of truth.
        group.current?.add(obj);
        return true;
      },
      applyDent: (globalIdx: number, worldImpactPoint: Vector3, amount: number) => {
        const entry = built.promoted.get(globalIdx);
        if (!entry) return;
        entry.mesh.updateMatrixWorld();
        _dentLocalPoint.copy(worldImpactPoint);
        entry.mesh.worldToLocal(_dentLocalPoint);
        applyDentToGeometry(entry.geometry, _dentLocalPoint, amount);
      },
      getMomentumInputs: (globalIdx: number) => {
        const entry = built.promoted.get(globalIdx);
        if (entry) return { angVel: entry.angVel, quat: entry.quat, scale: entry.mesh.scale };
        const state = built.states[globalIdx];
        if (!state) return null;
        // Graceful degradation: not promoted (dust tier or budget-full) —
        // recompute the pristine placement fresh rather than special-casing
        // a null angular velocity in the momentum formula.
        const placed = placeAsteroid(state.tierIdx, state.variantIdx, state.instIdx, state.seed);
        const angVel = placed.tumbleAxis
          ? placed.tumbleAxis.clone().multiplyScalar(placed.tumbleSpeed ?? 0)
          : new Vector3();
        return { angVel, quat: placed.quat, scale: placed.scale };
      },
      getSourceGeometry: (globalIdx: number) => {
        const entry = built.promoted.get(globalIdx);
        if (entry) return entry.geometry;
        const state = built.states[globalIdx];
        if (!state) return null;
        return built.geometryByKey.get(`${state.tierIdx}:${state.variantIdx}`) ?? null;
      },
    };
    return () => {
      asteroidRuntime.states = [];
      asteroidRuntime.grid = null;
      asteroidRuntime.killAsteroid = null;
      asteroidRuntime.promotion = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built, promotedMax]);

  // Free GPU resources on quality change / unmount.
  useEffect(() => {
    return () => {
      if (!built) return;
      built.meshes.forEach((bm) => bm.inst.dispose());
      built.geometryByKey.forEach((g) => g.dispose());
      built.promoted.forEach((entry) => entry.geometry.dispose());
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

        // Impact-knockback drift: `it.pos` and `s.pos` (and, once promoted,
        // the standalone mesh's own `.position`) are the same Vector3, so
        // integrating here is all rendering needs — no separate update path.
        if (s.vel.lengthSq() > KNOCKBACK_MIN_VEL_SQ) {
          s.pos.addScaledVector(s.vel, dt);
          s.vel.multiplyScalar(KNOCKBACK_DAMPING ** (dt * 60));
        } else if (s.vel.x !== 0 || s.vel.y !== 0 || s.vel.z !== 0) {
          s.vel.set(0, 0, 0); // snap to rest once negligible
        }

        if (s.promoted) continue; // rendering/rotation now owned by the promoted loop below

        q.setFromAxisAngle(it.axis, it.phase + t * it.speed);
        m.compose(it.pos, q, it.scale);
        bm.inst.setMatrixAt(i, m);
      }
      bm.inst.instanceMatrix.needsUpdate = true;
    }

    // Promoted asteroids: real integrated spin (Object3D auto-updates its
    // world matrix from position/quaternion/scale, so no manual compose
    // needed here — position is already live via the shared Vector3 above).
    for (const [globalIdx, entry] of built.promoted) {
      const s = built.states[globalIdx];
      if (!s?.alive) continue;
      entry.mesh.position.copy(s.pos); // knockback drift, integrated in the tumble loop above
      if (entry.angVel.lengthSq() < 1e-8) continue;
      _spinAxis.copy(entry.angVel).normalize();
      _spinDeltaQ.setFromAxisAngle(_spinAxis, entry.angVel.length() * dt);
      entry.quat.multiply(_spinDeltaQ);
      entry.mesh.quaternion.copy(entry.quat);
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

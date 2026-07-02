// Streams voxel chunks around the camera: generates chunk voxel data on demand,
// dispatches greedy meshing to the worker pool, swaps in finished geometry, and
// unloads distant chunks. Also exposes a live edit path (click-to-dig) that
// re-meshes only the affected chunk + touched neighbours — proving the dynamic
// engine end to end, which the 9.3b dig/build UX then builds on.

import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import {
  Group,
  Mesh,
  Raycaster,
  Vector2,
  LineSegments,
  EdgesGeometry,
  BoxGeometry,
  LineBasicMaterial,
  MeshBasicMaterial,
  InstancedMesh,
  Matrix4,
  Color,
  type PerspectiveCamera,
} from 'three';
import { useStore, nextStructureId, type Structure } from '../store';
import { getBiome } from '../terrain/biomes';
import { audio } from '../audio/AudioManager';
import { BUILDABLES } from './buildables';
import { createVoxelMaterial } from './voxelMaterial';
import { QUALITY } from '../systems/quality';
import {
  CHUNK_SIZE,
  PADDED_VOLUME,
  PADDED_SIZE,
  PALETTE_STRIDE,
  paddedIndex,
  voxelId,
  BLOCK,
  blockHardness,
  blockToResource,
  STRUCTURE_CORE_BLOCKS,
  type MeshRequest,
  type MeshResult,
} from './voxelTypes';
import { Chunk, chunkKey } from './chunk';
import { MesherPool, buildGeometry } from './mesher';
import { generateChunk } from './worldGen';
import { getVoxelPalette, getVoxelTerrain } from './voxelBiomes';
import { seedFromName } from './noise';
import {
  loadBodyEdits,
  saveBodyEdits,
  saveInventory,
  loadStructures,
  saveStructures,
  saveItems,
  saveSeen,
  type BodyEdits,
} from './persistence';
import type { VoxelApi } from './player';

function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

export function ChunkManager({
  planet,
  apiRef,
}: {
  planet: string;
  apiRef: MutableRefObject<VoxelApi | null>;
}) {
  const quality = useStore((s) => s.quality);
  const q = QUALITY[quality];
  const camera = useThree((s) => s.camera) as PerspectiveCamera;

  const group = useMemo(() => new Group(), []);
  const material = useMemo(() => createVoxelMaterial(getBiome(planet)), [planet]);

  // Targeted-voxel highlight (a subtle wireframe box around the aimed block).
  const highlight = useMemo(() => {
    const h = new LineSegments(
      new EdgesGeometry(new BoxGeometry(1.004, 1.004, 1.004)),
      new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthTest: true }),
    );
    h.visible = false;
    h.renderOrder = 3;
    return h;
  }, []);
  const aimRay = useMemo(() => new Raycaster(), []);
  const aimNdc = useMemo(() => new Vector2(0, 0), []);
  const aimVoxel = useRef<[number, number, number] | null>(null);
  // The empty cell adjacent to the aimed face — where placement happens.
  const placeVoxel = useRef<[number, number, number] | null>(null);

  // Hold-to-mine: a darkening "crack" box over the targeted voxel whose opacity
  // and scale track break progress, plus a small one-shot debris burst on break.
  const crack = useMemo(() => {
    const m = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshBasicMaterial({ color: 0x110d0a, transparent: true, opacity: 0, depthTest: true }),
    );
    m.visible = false;
    m.renderOrder = 2;
    return m;
  }, []);
  const burst = useMemo(() => {
    const inst = new InstancedMesh(
      new BoxGeometry(0.14, 0.14, 0.14),
      new MeshBasicMaterial({ vertexColors: false, toneMapped: false }),
      BURST_MAX,
    );
    inst.frustumCulled = false;
    inst.count = BURST_MAX;
    return inst;
  }, []);
  // Live debris particles (CPU-animated; matrices written each frame).
  const debris = useRef<Debris[]>([]);
  const mineState = useRef<{ key: string | null; progress: number; tickAcc: number }>({
    key: null,
    progress: 0,
    tickAcc: 0,
  });

  const params = useMemo(() => getVoxelTerrain(planet), [planet]);
  const seed = useMemo(() => seedFromName(planet), [planet]);
  const palette = useMemo(() => getVoxelPalette(planet), [planet]);

  // Vertical chunk span that can contain terrain (everything above is air).
  // Tall landmarks (e.g. Olympus Mons) raise the ceiling so their peaks aren't
  // clipped; basins/canyons only lower terrain, so they don't affect it.
  const vertMax = useMemo(() => {
    let up = 0;
    for (const lm of params.landmarks) {
      if (lm.kind === 'volcano' || lm.kind === 'ridge') up = Math.max(up, lm.amplitude);
    }
    const poiUp = params.pois.length > 0 ? 20 : 0; // POIs stand above the surface
    const maxH = params.baseHeight + params.rollAmp + params.mountainAmp + up + poiUp;
    return Math.floor(maxH / CHUNK_SIZE) + 1;
  }, [params]);

  const chunks = useRef(new Map<string, Chunk>());
  const meshes = useRef(new Map<string, Mesh>());
  const inFlight = useRef(new Set<string>());
  // Saved per-chunk edit overlays for this body, loaded from IndexedDB; applied
  // to chunks as they're (re)generated so a dug-out world persists across loads.
  const savedEdits = useRef<BodyEdits>({});
  const poolRef = useRef<MesherPool | null>(null);
  const padScratch = useRef(new Uint32Array(PADDED_VOLUME));

  // --- worker pool lifecycle ---
  useEffect(() => {
    const pool = new MesherPool(q.voxelWorkers);
    poolRef.current = pool;
    return () => {
      pool.dispose();
      poolRef.current = null;
    };
  }, [q.voxelWorkers]);

  // --- persistence: load this body's saved edits; save on leave / app-hide ---
  useEffect(() => {
    let alive = true;
    savedEdits.current = {};
    // Restore placed structures (silos) for this body.
    loadStructures(planet).then((list) => {
      if (!alive) return;
      const others = useStore.getState().structures.filter((s) => s.planet !== planet);
      useStore.getState().setStructures([...others, ...list]);
    });
    loadBodyEdits(planet).then((map) => {
      if (!alive) return;
      savedEdits.current = map;
      // Hydrate any chunks already created before the load resolved.
      for (const key in map) {
        const c = chunks.current.get(key);
        if (!c) continue;
        const [idx, val] = map[key];
        for (let i = 0; i < idx.length; i++) c.edits.set(idx[i], val[i]);
        if (c.generated) {
          c.reapplyEdits();
          c.refreshEmpty();
          c.meshedRev = -1; // force a re-mesh with the restored voxels
        }
      }
    });

    const saveNow = () => {
      const out: BodyEdits = {};
      for (const [key, c] of chunks.current) {
        if (c.edits.size === 0) continue;
        const idx: number[] = [];
        const val: number[] = [];
        for (const [i, v] of c.edits) {
          idx.push(i);
          val.push(v);
        }
        out[key] = [idx, val];
      }
      void saveBodyEdits(planet, out);
      void saveInventory(useStore.getState().inventory);
      void saveStructures(planet, useStore.getState().structures);
      void saveItems(useStore.getState().items);
      void saveSeen(useStore.getState().seenResources);
    };

    const onHide = () => {
      if (document.visibilityState === 'hidden') saveNow();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onHide);
      saveNow();
    };
  }, [planet]);

  // --- chunk helpers ---
  /** Get (or create, empty) the chunk; null if outside the vertical span. */
  const getOrCreate = (cx: number, cy: number, cz: number): Chunk | null => {
    if (cy < 0 || cy > vertMax) return null;
    const key = chunkKey(cx, cy, cz);
    let c = chunks.current.get(key);
    if (!c) {
      c = new Chunk(cx, cy, cz);
      // Seed any persisted edits so generateChunk's reapplyEdits restores them.
      const saved = savedEdits.current[key];
      if (saved) {
        const [idx, val] = saved;
        for (let i = 0; i < idx.length; i++) c.edits.set(idx[i], val[i]);
      }
      chunks.current.set(key, c);
    }
    return c;
  };

  /** Create + generate a chunk's voxel data if not already done. */
  const ensureGenerated = (cx: number, cy: number, cz: number): Chunk | null => {
    const c = getOrCreate(cx, cy, cz);
    if (c && !c.generated) generateChunk(c, params, seed);
    return c;
  };

  const worldVoxel = (wx: number, wy: number, wz: number): number => {
    const cx = floorDiv(wx, CHUNK_SIZE);
    const cy = floorDiv(wy, CHUNK_SIZE);
    const cz = floorDiv(wz, CHUNK_SIZE);
    if (cy < 0 || cy > vertMax) return 0;
    const c = chunks.current.get(chunkKey(cx, cy, cz));
    if (!c || !c.generated) return 0;
    return c.get(wx - cx * CHUNK_SIZE, wy - cy * CHUNK_SIZE, wz - cz * CHUNK_SIZE);
  };

  /** Build the padded neighbourhood (chunk + 1-voxel borders incl. edges). */
  const buildPadded = (cx: number, cy: number, cz: number): Uint32Array => {
    const pad = padScratch.current;
    const baseX = cx * CHUNK_SIZE - 1;
    const baseY = cy * CHUNK_SIZE - 1;
    const baseZ = cz * CHUNK_SIZE - 1;
    for (let py = 0; py < PADDED_SIZE; py++) {
      for (let pz = 0; pz < PADDED_SIZE; pz++) {
        for (let px = 0; px < PADDED_SIZE; px++) {
          pad[paddedIndex(px, py, pz)] = worldVoxel(baseX + px, baseY + py, baseZ + pz);
        }
      }
    }
    return pad;
  };

  const requestMesh = (c: Chunk) => {
    const pool = poolRef.current;
    if (!pool) return;
    // Ensure the 3x3x3 neighbourhood is generated for correct seams/AO.
    for (let dy = -1; dy <= 1; dy++)
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) ensureGenerated(c.cx + dx, c.cy + dy, c.cz + dz);

    const padded = buildPadded(c.cx, c.cy, c.cz);
    const req: MeshRequest = {
      type: 'mesh',
      key: c.key,
      rev: c.rev,
      // Fresh copies so the transferred buffers don't steal our scratch/palette.
      voxels: padded.slice(),
      palette: Float32Array.from(palette),
    };
    c.meshedRev = c.rev; // optimistic; a newer edit will bump rev again
    inFlight.current.add(c.key);
    pool.enqueue(req, (res) => onMeshed(res));
  };

  const onMeshed = (res: MeshResult) => {
    inFlight.current.delete(res.key);
    const c = chunks.current.get(res.key);
    // Drop stale meshes (a later edit superseded this revision).
    if (!c || res.rev !== c.rev) return;

    const old = meshes.current.get(res.key);
    if (old) {
      group.remove(old);
      old.geometry.dispose();
      meshes.current.delete(res.key);
    }
    const geo = buildGeometry(res);
    if (!geo) return; // empty chunk
    const mesh = new Mesh(geo, material);
    mesh.position.set(c.cx * CHUNK_SIZE, c.cy * CHUNK_SIZE, c.cz * CHUNK_SIZE);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    meshes.current.set(res.key, mesh);
  };

  const forceNeighbourRemesh = (cx: number, cy: number, cz: number) => {
    const c = chunks.current.get(chunkKey(cx, cy, cz));
    if (c) c.meshedRev = -1;
  };

  /** Remove (or set) a voxel at a world position and re-mesh affected chunks. */
  const editVoxel = (wx: number, wy: number, wz: number, id: number) => {
    const cx = floorDiv(wx, CHUNK_SIZE);
    const cy = floorDiv(wy, CHUNK_SIZE);
    const cz = floorDiv(wz, CHUNK_SIZE);
    const c = ensureGenerated(cx, cy, cz);
    if (!c) return;
    const lx = wx - cx * CHUNK_SIZE;
    const ly = wy - cy * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    if (!c.setLocal(lx, ly, lz, id)) return;
    // Touched a border? The neighbour's faces/AO change too.
    if (lx === 0) forceNeighbourRemesh(cx - 1, cy, cz);
    if (lx === CHUNK_SIZE - 1) forceNeighbourRemesh(cx + 1, cy, cz);
    if (ly === 0) forceNeighbourRemesh(cx, cy - 1, cz);
    if (ly === CHUNK_SIZE - 1) forceNeighbourRemesh(cx, cy + 1, cz);
    if (lz === 0) forceNeighbourRemesh(cx, cy, cz - 1);
    if (lz === CHUNK_SIZE - 1) forceNeighbourRemesh(cx, cy, cz + 1);
  };

  /** Solidity query for player collision (world voxel coords). Below the floor
   *  reads solid so the player can't fall out; generates on demand so collision
   *  is always against real data. */
  const isSolidApi = (wx: number, wy: number, wz: number): boolean => {
    const cy = floorDiv(wy, CHUNK_SIZE);
    if (cy < 0) return true;
    if (cy > vertMax) return false;
    const cx = floorDiv(wx, CHUNK_SIZE);
    const cz = floorDiv(wz, CHUNK_SIZE);
    const c = ensureGenerated(cx, cy, cz);
    if (!c) return false;
    return voxelId(c.get(wx - cx * CHUNK_SIZE, wy - cy * CHUNK_SIZE, wz - cz * CHUNK_SIZE)) !== BLOCK.AIR;
  };

  /** Block id at a world voxel (0 = air); generate-on-demand like isSolid. */
  const blockAtApi = (wx: number, wy: number, wz: number): number => {
    const cy = floorDiv(wy, CHUNK_SIZE);
    if (cy < 0) return BLOCK.ROCK;
    if (cy > vertMax) return BLOCK.AIR;
    const cx = floorDiv(wx, CHUNK_SIZE);
    const cz = floorDiv(wz, CHUNK_SIZE);
    const c = ensureGenerated(cx, cy, cz);
    if (!c) return BLOCK.AIR;
    return voxelId(c.get(wx - cx * CHUNK_SIZE, wy - cy * CHUNK_SIZE, wz - cz * CHUNK_SIZE));
  };

  /** Spawn a small debris burst at a voxel centre, tinted by the broken block. */
  const spawnBurst = (cx: number, cy: number, cz: number, block: number) => {
    const o = block * PALETTE_STRIDE;
    const r = palette[o] ?? 0.6;
    const g = palette[o + 1] ?? 0.6;
    const b = palette[o + 2] ?? 0.6;
    const n = 8;
    const list = debris.current;
    for (let i = 0; i < n && list.length < BURST_MAX; i++) {
      list.push({
        x: cx,
        y: cy,
        z: cz,
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 3,
        vz: (Math.random() - 0.5) * 4,
        life: 0,
        max: 0.45 + Math.random() * 0.3,
        r,
        g,
        b,
      });
    }
  };

  /** Continuous hold-to-mine at the crosshair. Accumulates progress against the
   *  block's hardness; on break, yields any resource, removes the voxel, and
   *  fires audio + a debris burst. Resets when the aim moves or mining stops. */
  const mineTick = (dt: number, active: boolean) => {
    const ms = mineState.current;
    const a = aimVoxel.current;
    if (!active || !a) {
      ms.key = null;
      ms.progress = 0;
      crack.visible = false;
      return;
    }
    const block = blockAtApi(a[0], a[1], a[2]);
    if (block === BLOCK.AIR) {
      crack.visible = false;
      return;
    }
    const key = `${a[0]},${a[1]},${a[2]}`;
    if (key !== ms.key) {
      ms.key = key;
      ms.progress = 0;
    }
    ms.progress += dt;
    ms.tickAcc += dt;
    const frac = Math.min(ms.progress / blockHardness(block), 1);

    crack.position.set(a[0] + 0.5, a[1] + 0.5, a[2] + 0.5);
    crack.scale.setScalar(1.002);
    (crack.material as MeshBasicMaterial).opacity = 0.1 + frac * 0.55;
    crack.visible = true;

    if (ms.tickAcc >= 0.16) {
      ms.tickAcc = 0;
      audio.playMineTick();
    }

    if (frac >= 1) {
      const res = blockToResource(block);
      if (res) {
        useStore
          .getState()
          .mineResource(res, 1, planet, [a[0] + 0.5, a[1] + 0.5, a[2] + 0.5]);
      }
      spawnBurst(a[0] + 0.5, a[1] + 0.5, a[2] + 0.5, block);
      audio.playMineBreak();
      // Mining a structure core removes the entity (silos spill their contents).
      if (STRUCTURE_CORE_BLOCKS.has(block)) {
        const st = useStore
          .getState()
          .structures.find((s) => s.pos[0] === a[0] && s.pos[1] === a[1] && s.pos[2] === a[2]);
        if (st) useStore.getState().removeStructure(st.id);
      }
      editVoxel(a[0], a[1], a[2], BLOCK.AIR);
      ms.key = null;
      ms.progress = 0;
      crack.visible = false;
    }
  };

  /** Place the active buildable in the cell adjacent to the aimed face. */
  const placeApi = () => {
    const p = placeVoxel.current;
    if (!p) return;
    if (blockAtApi(p[0], p[1], p[2]) !== BLOCK.AIR) return; // cell occupied
    const store = useStore.getState();
    const b = BUILDABLES[store.activeBuildable];
    // Afford-check both costs before deducting either (no partial spend).
    if (b.itemCost) {
      for (const k in b.itemCost) {
        if ((store.items[k as keyof typeof store.items] ?? 0) < (b.itemCost[k as keyof typeof b.itemCost] ?? 0)) return;
      }
    }
    if (!store.spendResources(b.cost)) return; // can't afford
    if (b.itemCost && !store.spendItems(b.itemCost)) return; // (checked above)
    for (const v of b.stamp) editVoxel(p[0] + v.dx, p[1] + v.dy, p[2] + v.dz, v.block);
    if (b.structureType && store.sceneMode.type === 'voxel') {
      const structure: Structure = {
        id: nextStructureId(),
        planet: store.sceneMode.planet,
        type: b.structureType,
        pos: [p[0], p[1], p[2]],
        stored: {},
        capacity: b.capacity ?? 0,
      };
      store.addStructure(structure);
    }
    audio.playPlace();
  };

  // Publish the surface API for the player controller.
  useEffect(() => {
    apiRef.current = { isSolid: isSolidApi, blockAt: blockAtApi, edit: editVoxel, mineTick, place: placeApi };
    return () => {
      apiRef.current = null;
    };
    // Rebound when the body (params/seed) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiRef, params, seed, vertMax]);

  // --- cleanup on unmount ---
  useEffect(() => {
    const meshMap = meshes.current;
    const chunkMap = chunks.current;
    return () => {
      for (const m of meshMap.values()) m.geometry.dispose();
      meshMap.clear();
      chunkMap.clear();
      material.dispose();
      highlight.geometry.dispose();
      (highlight.material as LineBasicMaterial).dispose();
      crack.geometry.dispose();
      (crack.material as MeshBasicMaterial).dispose();
      burst.geometry.dispose();
      (burst.material as MeshBasicMaterial).dispose();
    };
  }, [material, highlight, crack, burst]);

  // --- per-frame streaming ---
  const camChunk = useRef({ x: NaN, z: NaN });
  useFrame((_, dtRaw) => {
    if (useStore.getState().sceneMode.type !== 'voxel') return;
    const dt = Math.min(dtRaw, 0.05);
    const pool = poolRef.current;
    if (!pool) return;

    const R = q.voxelViewRadius;
    const ccx = floorDiv(camera.position.x, CHUNK_SIZE);
    const ccz = floorDiv(camera.position.z, CHUNK_SIZE);

    // Unload chunks well outside the view (dispose meshes; keep edited data).
    const keep = R + 2;
    for (const [key, mesh] of meshes.current) {
      const dx = Math.abs(mesh.position.x / CHUNK_SIZE - ccx);
      const dz = Math.abs(mesh.position.z / CHUNK_SIZE - ccz);
      if (dx > keep || dz > keep) {
        group.remove(mesh);
        mesh.geometry.dispose();
        meshes.current.delete(key);
      }
    }
    for (const [key, c] of chunks.current) {
      if (c.edits.size > 0) continue; // never drop edited data this session
      const dx = Math.abs(c.cx - ccx);
      const dz = Math.abs(c.cz - ccz);
      if (dx > keep || dz > keep) chunks.current.delete(key);
    }

    // Generate + mesh nearest-first within the view radius.
    let meshBudget = q.voxelMeshBudget;
    let genBudget = 12;
    for (let r = 0; r <= R && meshBudget > 0; r++) {
      for (let dx = -r; dx <= r && meshBudget > 0; dx++) {
        for (let dz = -r; dz <= r && meshBudget > 0; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; // ring shell
          for (let cy = 0; cy <= vertMax && meshBudget > 0; cy++) {
            const c = getOrCreate(ccx + dx, cy, ccz + dz);
            if (!c) continue;
            if (!c.generated) {
              if (genBudget <= 0) continue; // throttle worldgen to avoid hitches
              generateChunk(c, params, seed);
              genBudget--;
            }
            if (c.needsMesh() && !inFlight.current.has(c.key)) {
              requestMesh(c);
              meshBudget--;
            }
          }
        }
      }
    }
    camChunk.current.x = ccx;
    camChunk.current.z = ccz;

    updateDebris(burst, debris.current, dt, _burstM, _burstC);

    // Aim: raycast from the crosshair to find the targeted voxel (within reach)
    // for the highlight + dig.
    aimRay.setFromCamera(aimNdc, camera);
    const hits = aimRay.intersectObjects([...meshes.current.values()], false);
    const hit = hits.length > 0 ? hits[0] : null;
    if (hit && hit.face && hit.distance <= REACH) {
      const nx = Math.round(hit.face.normal.x);
      const ny = Math.round(hit.face.normal.y);
      const nz = Math.round(hit.face.normal.z);
      const ix = Math.floor(hit.point.x - hit.face.normal.x * 0.5);
      const iy = Math.floor(hit.point.y - hit.face.normal.y * 0.5);
      const iz = Math.floor(hit.point.z - hit.face.normal.z * 0.5);
      aimVoxel.current = [ix, iy, iz];
      placeVoxel.current = [ix + nx, iy + ny, iz + nz]; // the air cell on the hit face
      highlight.position.set(ix + 0.5, iy + 0.5, iz + 0.5);
      highlight.visible = true;
    } else {
      aimVoxel.current = null;
      placeVoxel.current = null;
      highlight.visible = false;
    }
  });

  return (
    <>
      <primitive object={group} />
      <primitive object={highlight} />
      <primitive object={crack} />
      <primitive object={burst} />
    </>
  );
}

const REACH = 6; // max dig/highlight distance in voxels

/** Max simultaneous debris cubes across all active bursts. */
const BURST_MAX = 64;
const BURST_GRAVITY = 16;
const _burstM = new Matrix4();
const _burstC = new Color();

interface Debris {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  r: number;
  g: number;
  b: number;
}

/** Integrate + render the live debris cubes into the shared InstancedMesh.
 *  Dead particles are swap-removed; unused instances are scaled to zero. */
function updateDebris(inst: InstancedMesh, list: Debris[], dt: number, m: Matrix4, c: Color): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const d = list[i];
    d.life += dt;
    if (d.life >= d.max) {
      list[i] = list[list.length - 1];
      list.pop();
      continue;
    }
    d.vy -= BURST_GRAVITY * dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.z += d.vz * dt;
  }
  for (let i = 0; i < BURST_MAX; i++) {
    const d = list[i];
    if (d) {
      const s = 1 - d.life / d.max; // shrink as it fades
      m.makeScale(s, s, s);
      m.setPosition(d.x, d.y, d.z);
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, c.setRGB(d.r, d.g, d.b));
    } else {
      m.makeScale(0, 0, 0);
      inst.setMatrixAt(i, m);
    }
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
}

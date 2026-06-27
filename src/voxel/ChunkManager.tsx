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
  type PerspectiveCamera,
} from 'three';
import { useStore } from '../store';
import { getBiome } from '../terrain/biomes';
import { createVoxelMaterial } from './voxelMaterial';
import { QUALITY } from '../systems/quality';
import {
  CHUNK_SIZE,
  PADDED_VOLUME,
  PADDED_SIZE,
  paddedIndex,
  voxelId,
  BLOCK,
  type MeshRequest,
  type MeshResult,
} from './voxelTypes';
import { Chunk, chunkKey } from './chunk';
import { MesherPool, buildGeometry } from './mesher';
import { generateChunk } from './worldGen';
import { getVoxelPalette, getVoxelTerrain } from './voxelBiomes';
import { seedFromName } from './noise';
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

  // --- chunk helpers ---
  /** Get (or create, empty) the chunk; null if outside the vertical span. */
  const getOrCreate = (cx: number, cy: number, cz: number): Chunk | null => {
    if (cy < 0 || cy > vertMax) return null;
    const key = chunkKey(cx, cy, cz);
    let c = chunks.current.get(key);
    if (!c) {
      c = new Chunk(cx, cy, cz);
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

  /** Break the voxel currently under the crosshair (driven by tap/click). */
  const digApi = () => {
    const a = aimVoxel.current;
    if (a) editVoxel(a[0], a[1], a[2], BLOCK.AIR);
  };

  // Publish the surface API for the player controller.
  useEffect(() => {
    apiRef.current = { isSolid: isSolidApi, blockAt: blockAtApi, edit: editVoxel, dig: digApi };
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
    };
  }, [material, highlight]);

  // --- per-frame streaming ---
  const camChunk = useRef({ x: NaN, z: NaN });
  useFrame(() => {
    if (useStore.getState().sceneMode.type !== 'voxel') return;
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

    // Aim: raycast from the crosshair to find the targeted voxel (within reach)
    // for the highlight + dig.
    aimRay.setFromCamera(aimNdc, camera);
    const hits = aimRay.intersectObjects([...meshes.current.values()], false);
    const hit = hits.length > 0 ? hits[0] : null;
    if (hit && hit.face && hit.distance <= REACH) {
      const ix = Math.floor(hit.point.x - hit.face.normal.x * 0.5);
      const iy = Math.floor(hit.point.y - hit.face.normal.y * 0.5);
      const iz = Math.floor(hit.point.z - hit.face.normal.z * 0.5);
      aimVoxel.current = [ix, iy, iz];
      highlight.position.set(ix + 0.5, iy + 0.5, iz + 0.5);
      highlight.visible = true;
    } else {
      aimVoxel.current = null;
      highlight.visible = false;
    }
  });

  return (
    <>
      <primitive object={group} />
      <primitive object={highlight} />
    </>
  );
}

const REACH = 6; // max dig/highlight distance in voxels

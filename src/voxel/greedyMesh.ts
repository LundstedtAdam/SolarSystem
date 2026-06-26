// Pure greedy voxel mesher (no DOM / worker / three dependencies, so it can be
// unit-tested in isolation). Operates on a padded voxel neighbourhood, merges
// coplanar same-material faces, bakes per-corner ambient occlusion into vertex
// colours, and returns exact-size typed arrays.
//
// Vertex pooling: scratch buffers are module-scoped and reused across calls, so
// steady-state meshing does no per-quad allocation (only one copy-out per mesh).

import { CHUNK_SIZE, PALETTE_STRIDE, paddedIndex, voxelId, BLOCK } from './voxelTypes';

const N = CHUNK_SIZE;

// AO level (0 darkest .. 3 unoccluded) -> brightness multiplier.
const AO_CURVE = [0.45, 0.65, 0.82, 1.0];

export interface MeshArrays {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  indexCount: number;
}

// --- vertex pool (reused across calls) ---------------------------------------
let posPool = new Float32Array(0);
let normPool = new Float32Array(0);
let colPool = new Float32Array(0);
let idxPool = new Uint32Array(0);
let vCount = 0;
let iCount = 0;

function ensureVertexCapacity(extraVerts: number) {
  const need3 = (vCount + extraVerts) * 3;
  if (need3 <= posPool.length) return;
  let cap = Math.max(posPool.length * 2, 1024 * 3);
  while (cap < need3) cap *= 2;
  const np = new Float32Array(cap); np.set(posPool.subarray(0, vCount * 3)); posPool = np;
  const nn = new Float32Array(cap); nn.set(normPool.subarray(0, vCount * 3)); normPool = nn;
  // Colours are RGBA (rgb = albedo*AO, a = emissive), so 4 floats per vertex.
  const cap4 = (cap / 3) * 4;
  const nc = new Float32Array(cap4); nc.set(colPool.subarray(0, vCount * 4)); colPool = nc;
}

function ensureIndexCapacity(extra: number) {
  const need = iCount + extra;
  if (need <= idxPool.length) return;
  let cap = Math.max(idxPool.length * 2, 2048);
  while (cap < need) cap *= 2;
  const ni = new Uint32Array(cap); ni.set(idxPool.subarray(0, iCount)); idxPool = ni;
}

let vox: Uint32Array = new Uint32Array(0);

function solid(x: number, y: number, z: number): boolean {
  return voxelId(vox[paddedIndex(x + 1, y + 1, z + 1)]) !== BLOCK.AIR;
}
function blockAt(x: number, y: number, z: number): number {
  return voxelId(vox[paddedIndex(x + 1, y + 1, z + 1)]);
}
function aoValue(s1: boolean, s2: boolean, cor: boolean): number {
  if (s1 && s2) return 0;
  return 3 - ((s1 ? 1 : 0) + (s2 ? 1 : 0) + (cor ? 1 : 0));
}

function packFaceAO(
  sx: number, sy: number, sz: number,
  d: number, u: number, v: number, dir: number,
): number {
  const base = [sx, sy, sz];
  base[d] += dir;
  const occ = (du: number, dv: number): boolean => {
    const p = [base[0], base[1], base[2]];
    p[u] += du;
    p[v] += dv;
    return solid(p[0], p[1], p[2]);
  };
  const ao00 = aoValue(occ(-1, 0), occ(0, -1), occ(-1, -1));
  const ao10 = aoValue(occ(1, 0), occ(0, -1), occ(1, -1));
  const ao11 = aoValue(occ(1, 0), occ(0, 1), occ(1, 1));
  const ao01 = aoValue(occ(-1, 0), occ(0, 1), occ(-1, 1));
  return ao00 | (ao10 << 2) | (ao11 << 4) | (ao01 << 6);
}

function pushVertex(
  px: number, py: number, pz: number,
  nx: number, ny: number, nz: number,
  cr: number, cg: number, cb: number, ce: number,
) {
  const o = vCount * 3;
  posPool[o] = px; posPool[o + 1] = py; posPool[o + 2] = pz;
  normPool[o] = nx; normPool[o + 1] = ny; normPool[o + 2] = nz;
  const c = vCount * 4;
  colPool[c] = cr; colPool[c + 1] = cg; colPool[c + 2] = cb; colPool[c + 3] = ce;
  vCount++;
}

function quadIndices(a: number, b: number, c: number, e: number, flip: boolean) {
  const o = iCount;
  if (flip) {
    idxPool[o] = b; idxPool[o + 1] = c; idxPool[o + 2] = e;
    idxPool[o + 3] = b; idxPool[o + 4] = e; idxPool[o + 5] = a;
  } else {
    idxPool[o] = a; idxPool[o + 1] = b; idxPool[o + 2] = c;
    idxPool[o + 3] = a; idxPool[o + 4] = c; idxPool[o + 5] = e;
  }
  iCount += 6;
}

function emitQuad(
  d: number, u: number, v: number, slice: number,
  i: number, j: number, w: number, h: number,
  dir: number, id: number, ao: number, palette: Float32Array,
) {
  ensureVertexCapacity(4);
  ensureIndexCapacity(6);

  const p = [0, 0, 0]; p[d] = slice; p[u] = i; p[v] = j;
  const du = [0, 0, 0]; du[u] = w;
  const dv = [0, 0, 0]; dv[v] = h;

  const c00 = AO_CURVE[ao & 3];
  const c10 = AO_CURVE[(ao >> 2) & 3];
  const c11 = AO_CURVE[(ao >> 4) & 3];
  const c01 = AO_CURVE[(ao >> 6) & 3];

  const nx = d === 0 ? dir : 0;
  const ny = d === 1 ? dir : 0;
  const nz = d === 2 ? dir : 0;
  const r = palette[id * PALETTE_STRIDE];
  const g = palette[id * PALETTE_STRIDE + 1];
  const b = palette[id * PALETTE_STRIDE + 2];
  const em = palette[id * PALETTE_STRIDE + 3]; // emissive (not AO-darkened)

  const v0 = vCount;
  pushVertex(p[0], p[1], p[2], nx, ny, nz, r * c00, g * c00, b * c00, em);
  pushVertex(p[0] + du[0], p[1] + du[1], p[2] + du[2], nx, ny, nz, r * c10, g * c10, b * c10, em);
  pushVertex(
    p[0] + du[0] + dv[0], p[1] + du[1] + dv[1], p[2] + du[2] + dv[2],
    nx, ny, nz, r * c11, g * c11, b * c11, em,
  );
  pushVertex(p[0] + dv[0], p[1] + dv[1], p[2] + dv[2], nx, ny, nz, r * c01, g * c01, b * c01, em);

  const a00 = ao & 3;
  const a10 = (ao >> 2) & 3;
  const a11 = (ao >> 4) & 3;
  const a01 = (ao >> 6) & 3;
  const flip = a00 + a11 > a10 + a01;
  if (dir > 0) quadIndices(v0, v0 + 1, v0 + 2, v0 + 3, flip);
  else quadIndices(v0, v0 + 3, v0 + 2, v0 + 1, flip);
}

/** Greedy-mesh a padded voxel neighbourhood into vertex/index arrays. */
export function greedyMesh(voxels: Uint32Array, palette: Float32Array): MeshArrays {
  vox = voxels;
  vCount = 0;
  iCount = 0;

  const x = [0, 0, 0];
  const q = [0, 0, 0];
  const maskDir = new Int8Array(N * N);
  const maskId = new Int32Array(N * N);
  const maskAO = new Int32Array(N * N);

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    q[0] = 0; q[1] = 0; q[2] = 0; q[d] = 1;

    for (x[d] = -1; x[d] < N; ) {
      let n = 0;
      for (x[v] = 0; x[v] < N; x[v]++) {
        for (x[u] = 0; x[u] < N; x[u]++, n++) {
          const a = solid(x[0], x[1], x[2]);
          const b = solid(x[0] + q[0], x[1] + q[1], x[2] + q[2]);
          if (a === b) { maskDir[n] = 0; continue; }
          const dir = a ? 1 : -1;
          const sx = a ? x[0] : x[0] + q[0];
          const sy = a ? x[1] : x[1] + q[1];
          const sz = a ? x[2] : x[2] + q[2];
          maskDir[n] = dir;
          maskId[n] = blockAt(sx, sy, sz);
          maskAO[n] = packFaceAO(sx, sy, sz, d, u, v, dir);
        }
      }

      x[d]++;

      n = 0;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; ) {
          const dir = maskDir[n];
          if (dir === 0) { i++; n++; continue; }
          const cid = maskId[n];
          const cao = maskAO[n];

          let w = 1;
          while (
            i + w < N && maskDir[n + w] === dir &&
            maskId[n + w] === cid && maskAO[n + w] === cao
          ) w++;

          let h = 1;
          let stop = false;
          while (j + h < N && !stop) {
            for (let k = 0; k < w; k++) {
              const idx = n + k + h * N;
              if (maskDir[idx] !== dir || maskId[idx] !== cid || maskAO[idx] !== cao) {
                stop = true;
                break;
              }
            }
            if (!stop) h++;
          }

          emitQuad(d, u, v, x[d], i, j, w, h, dir, cid, cao, palette);

          for (let l = 0; l < h; l++)
            for (let k = 0; k < w; k++) maskDir[n + k + l * N] = 0;
          i += w;
          n += w;
        }
      }
    }
  }

  return {
    positions: new Float32Array(posPool.subarray(0, vCount * 3)),
    normals: new Float32Array(normPool.subarray(0, vCount * 3)),
    colors: new Float32Array(colPool.subarray(0, vCount * 4)),
    indices: new Uint32Array(idxPool.subarray(0, iCount)),
    indexCount: iCount,
  };
}

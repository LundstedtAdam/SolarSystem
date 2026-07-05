// Main-thread side of the mesher: a small worker pool that owns the
// mesher.worker instances and routes typed MeshRequest/MeshResult traffic, plus
// a helper that turns a MeshResult's transferred buffers into a BufferGeometry.

import { BufferGeometry, BufferAttribute } from 'three';
import {
  requestTransfer,
  type MeshRequest,
  type MeshResult,
} from './voxelTypes';

/** One geometry group's buffers (the MeshResult carries two: opaque + water). */
export interface GeometryBuffers {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  /** Per-vertex (uLocal, vLocal, tileIndex) into the material atlas. Pass an
   *  empty array for geometry that has no texture (e.g. the water surface). */
  uvs: Float32Array;
  indices: Uint32Array;
  indexCount: number;
}

type MeshDone = (res: MeshResult) => void;

interface Job {
  req: MeshRequest;
  done: MeshDone;
}

export class MesherPool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: Job[] = [];
  private active = new Map<Worker, MeshDone>();

  constructor(count: number) {
    const n = Math.max(1, Math.min(count, 8));
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./mesher.worker.ts', import.meta.url), {
        type: 'module',
      });
      w.onmessage = (e: MessageEvent<MeshResult>) => this.onResult(w, e.data);
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  /** Queue a chunk for meshing. The result is delivered to `done`; the caller
   *  decides (via rev) whether it's still current. */
  enqueue(req: MeshRequest, done: MeshDone): void {
    this.queue.push({ req, done });
    this.pump();
  }

  /** Number of jobs waiting for a free worker. */
  get backlog(): number {
    return this.queue.length;
  }

  private onResult(w: Worker, res: MeshResult): void {
    const done = this.active.get(w);
    this.active.delete(w);
    this.idle.push(w);
    if (done) done(res);
    this.pump();
  }

  private pump(): void {
    while (this.idle.length > 0 && this.queue.length > 0) {
      const w = this.idle.pop()!;
      const job = this.queue.shift()!;
      this.active.set(w, job.done);
      w.postMessage(job.req, requestTransfer(job.req));
    }
  }

  dispose(): void {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.idle = [];
    this.queue = [];
    this.active.clear();
  }
}

/** Assemble a BufferGeometry from one geometry group. Returns null when empty. */
export function buildGeometry(res: GeometryBuffers): BufferGeometry | null {
  if (res.indexCount === 0) return null;
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(res.positions, 3));
  geo.setAttribute('normal', new BufferAttribute(res.normals, 3));
  geo.setAttribute('color', new BufferAttribute(res.colors, 4));
  if (res.uvs.length > 0) geo.setAttribute('materialUV', new BufferAttribute(res.uvs, 3));
  geo.setIndex(new BufferAttribute(res.indices, 1));
  geo.computeBoundingSphere();
  return geo;
}

// Thin worker wrapper: receives a padded voxel neighbourhood, runs the pure
// greedy mesher, and returns the geometry buffers via Transferable Objects
// (zero-copy). All meshing logic lives in greedyMesh.ts so it can be unit-tested
// off the worker.

import { greedyMesh } from './greedyMesh';
import type { MeshRequest, MeshResult } from './voxelTypes';

const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<MeshRequest>) => {
  const req = e.data;
  if (req.type !== 'mesh') return;

  const m = greedyMesh(req.voxels, req.palette);
  const result: MeshResult = {
    type: 'mesh',
    key: req.key,
    rev: req.rev,
    positions: m.positions,
    normals: m.normals,
    colors: m.colors,
    indices: m.indices,
    indexCount: m.indexCount,
  };
  ctx.postMessage(result, [
    result.positions.buffer,
    result.normals.buffer,
    result.colors.buffer,
    result.indices.buffer,
  ]);
};

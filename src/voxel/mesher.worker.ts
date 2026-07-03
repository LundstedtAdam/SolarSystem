// Thin worker wrapper: receives a padded voxel neighbourhood, runs the pure
// greedy mesher, and returns the geometry buffers via Transferable Objects
// (zero-copy). All meshing logic lives in greedyMesh.ts so it can be unit-tested
// off the worker.

import { greedyMesh } from './greedyMesh';
import { resultTransfer, type MeshRequest, type MeshResult } from './voxelTypes';

const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<MeshRequest>) => {
  const req = e.data;
  if (req.type !== 'mesh') return;

  const { opaque, water } = greedyMesh(req.voxels, req.palette);
  const result: MeshResult = {
    type: 'mesh',
    key: req.key,
    rev: req.rev,
    positions: opaque.positions,
    normals: opaque.normals,
    colors: opaque.colors,
    indices: opaque.indices,
    indexCount: opaque.indexCount,
    waterPositions: water.positions,
    waterNormals: water.normals,
    waterColors: water.colors,
    waterIndices: water.indices,
    waterIndexCount: water.indexCount,
  };
  ctx.postMessage(result, resultTransfer(result));
};

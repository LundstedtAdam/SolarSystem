// Pure geometry builder extracted from VoxelScatter.tsx so it can be unit
// tested directly (same "extract non-component logic to a sibling module"
// pattern already used for Emitters.tsx/emitterPoints.ts — a component file
// exporting a plain function trips the react-refresh/only-export-components
// lint rule).

import { BufferGeometry, Float32BufferAttribute } from 'three';

/** Two crossed vertical quads (an X-shaped billboard), base at local y=0 so it
 *  places like every other kind. Built by hand (no external merge utility)
 *  the same way greedyMesh.ts hand-builds its vertex buffers — cheap, and the
 *  only way to get a two-quad "cross" as a single InstancedMesh geometry. */
export function crossedQuadGeometry(width: number, height: number): BufferGeometry {
  const hw = width / 2;
  const geo = new BufferGeometry();
  const positions = new Float32Array([
    -hw, 0, 0, hw, 0, 0, hw, height, 0, -hw, 0, 0, hw, height, 0, -hw, height, 0,
    0, 0, -hw, 0, 0, hw, 0, height, hw, 0, 0, -hw, 0, height, hw, 0, height, -hw,
  ]);
  const normals = new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
  ]);
  // Standard unit-square UVs per triangle pair, v=0 at the base (local y=0)
  // rising to v=1 at the tip — matches getBladeAlphaTexture's own root-to-tip
  // row convention so the 'blade' kind's alpha cutout lines up correctly.
  const uvs = new Float32Array([
    0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1,
  ]);
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  return geo;
}

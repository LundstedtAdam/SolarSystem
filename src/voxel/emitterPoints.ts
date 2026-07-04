// Shared Points/material construction for world-anchored particle emitters
// (Emitters.tsx's cell-hash-scattered columns, RiverWaterfalls.tsx's
// fixed-position waterfalls). Split into its own module (rather than
// exported from Emitters.tsx) so react-refresh's "only export components"
// rule stays satisfied for both consumer files.

import { BufferGeometry, BufferAttribute, Points, PointsMaterial, AdditiveBlending, NormalBlending, Color } from 'three/webgpu';

/** Park dead/idle particles far below the world. Exported so consumers that
 *  recycle individual particles (e.g. Emitters.tsx's ballistic dust) can
 *  reuse the exact same sentinel. */
export const HIDDEN_Y = -100000;

export function makePoints(
  capacity: number,
  color: [number, number, number],
  size: number,
  additive: boolean,
): Points {
  const positions = new Float32Array(capacity * 3);
  for (let i = 0; i < capacity; i++) positions[i * 3 + 1] = HIDDEN_Y;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  const material = new PointsMaterial({
    size,
    sizeAttenuation: true,
    color: new Color(...color),
    transparent: true,
    opacity: additive ? 0.7 : 0.55,
    depthWrite: false,
    blending: additive ? AdditiveBlending : NormalBlending,
  });
  const p = new Points(geometry, material);
  p.frustumCulled = false;
  return p;
}

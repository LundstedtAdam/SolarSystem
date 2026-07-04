// World Richness Phase 6 — waterfalls are never hand-placed or cell-hash
// scattered like the other emitters (Emitters.tsx); they're derived
// automatically from a body's own 'river' landmark polylines wherever two
// consecutive points differ enough in natural terrain height, so a waterfall
// can never drift out of sync with the river geometry that carved it.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, type Material } from 'three/webgpu';
import { useStore } from '../store';
import { getContent } from './contentProfiles';
import { getEmitterVisual } from './emitterProfiles';
import { getVoxelTerrain } from './voxelBiomes';
import { surfaceHeightAt } from './worldGen';
import { seedFromName } from './noise';
import { makePoints } from './emitterPoints';

/** Minimum elevation change (voxels) between consecutive river points before
 *  it counts as a waterfall rather than an ordinary gentle slope. */
const DROP_THRESHOLD = 8;

interface WaterfallSite {
  x: number;
  z: number;
  /** Top of the drop — particles fall from here down to `top - dropHeight`. */
  top: number;
  dropHeight: number;
}

function findWaterfallSites(planet: string): WaterfallSite[] {
  const terrain = getVoxelTerrain(planet);
  const seed = seedFromName(planet);
  const sites: WaterfallSite[] = [];
  for (const lm of getContent(planet).landmarks) {
    if (lm.kind !== 'river' || !lm.points || lm.points.length < 2) continue;
    for (let i = 0; i < lm.points.length - 1; i++) {
      const [ax, az] = lm.points[i];
      const [bx, bz] = lm.points[i + 1];
      const ha = surfaceHeightAt(ax, az, terrain, seed);
      const hb = surfaceHeightAt(bx, bz, terrain, seed);
      const drop = ha - hb;
      if (Math.abs(drop) < DROP_THRESHOLD) continue;
      const [hx, hz, top] = drop > 0 ? [ax, az, ha] : [bx, bz, hb];
      sites.push({ x: hx, z: hz, top, dropHeight: Math.abs(drop) });
    }
  }
  return sites;
}

/** One fixed-position falling-mist column — same Points/material machinery
 *  as Emitters.tsx's column emitters, but a single unmoving anchor instead
 *  of a cell-hash-rebuilt set, since a waterfall's location is derived once
 *  from its river's own geometry, never scattered. */
function WaterfallColumn({ site }: { site: WaterfallSite }) {
  const visual = useMemo(() => getEmitterVisual('waterfall'), []);
  const height = Math.min(visual.height, site.dropHeight);
  const capacity = visual.particles;

  const points = useMemo(
    () => makePoints(capacity, visual.color, visual.size, visual.additive),
    [capacity, visual],
  );

  const state = useRef({
    angle: new Float32Array(capacity),
    radius: new Float32Array(capacity),
    h: new Float32Array(capacity),
  });

  useEffect(() => {
    const s = state.current;
    for (let i = 0; i < capacity; i++) {
      s.angle[i] = Math.random() * Math.PI * 2;
      s.radius[i] = visual.spread * Math.sqrt(Math.random());
      s.h[i] = Math.random() * height;
    }
    points.geometry.setDrawRange(0, capacity);
    return () => {
      points.geometry.dispose();
      (points.material as Material).dispose();
    };
  }, [points, capacity, visual, height]);

  useFrame((_, dt) => {
    if (useStore.getState().sceneMode.type !== 'voxel') return;
    const d = Math.min(dt, 0.05);
    const s = state.current;
    const base = site.top - height;
    const arr = (points.geometry.attributes.position as BufferAttribute).array as Float32Array;
    for (let i = 0; i < capacity; i++) {
      // visual.rise is negative (falls); h wraps within [0, height] exactly
      // like Emitters.tsx's rising column emitters, just falling instead.
      let h = s.h[i] + visual.rise * d;
      if (h < 0) h += height;
      else if (h > height) h -= height;
      s.h[i] = h;
      const ang = (s.angle[i] += visual.swirl * d);
      const r = s.radius[i];
      arr[i * 3] = site.x + Math.cos(ang) * r;
      arr[i * 3 + 1] = base + h;
      arr[i * 3 + 2] = site.z + Math.sin(ang) * r;
    }
    (points.geometry.attributes.position as BufferAttribute).needsUpdate = true;
  });

  return <primitive object={points} />;
}

export function RiverWaterfalls({ planet }: { planet: string }) {
  const sites = useMemo(() => findWaterfallSites(planet), [planet]);
  return (
    <>
      {sites.map((site, i) => (
        <WaterfallColumn key={i} site={site} />
      ))}
    </>
  );
}

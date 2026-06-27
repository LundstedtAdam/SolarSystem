import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BufferGeometry,
  BufferAttribute,
  Points,
  PointsMaterial,
  AdditiveBlending,
  NormalBlending,
  Color,
  type Material,
} from 'three/webgpu';
import { useStore } from '../store';
import { QUALITY } from '../systems/quality';
import { getContent } from './contentProfiles';
import { getEmitterVisual } from './emitterProfiles';
import type { EmitterSpec } from './contentProfiles';
import { getVoxelTerrain } from './voxelBiomes';
import { getSurfacePhysics } from './voxelPhysics';
import { landHeightAt } from './worldGen';
import { seedFromName, cellHash } from './noise';

const HIDDEN_Y = -100000; // park dead/idle particles far below the world
const MAX_ANCHORS = 12; // bound active column emitters around the player

function makePoints(
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

/** Deterministically-placed column emitters around the player (dust devils,
 *  fumaroles, geysers, methane bubbles). Anchors are rebuilt when the player
 *  crosses a cell boundary; particles rise within a column and recycle. */
function ColumnEmitterField({
  spec,
  terrain,
  seed,
  budget,
}: {
  spec: EmitterSpec;
  terrain: ReturnType<typeof getVoxelTerrain>;
  seed: number;
  budget: number;
}) {
  const camera = useThree((s) => s.camera);
  const visual = useMemo(() => getEmitterVisual(spec.kind), [spec.kind]);
  const capacity = Math.max(1, Math.min(budget, visual.particles * MAX_ANCHORS));

  const points = useMemo(
    () => makePoints(capacity, visual.color, visual.size, visual.additive),
    [capacity, visual],
  );

  // Per-particle state: anchor index, swirl angle, radius, local height.
  const state = useRef({
    count: 0,
    ax: new Float32Array(MAX_ANCHORS),
    az: new Float32Array(MAX_ANCHORS),
    ay: new Float32Array(MAX_ANCHORS),
    anchors: 0,
    pAnchor: new Int32Array(capacity),
    pAngle: new Float32Array(capacity),
    pRadius: new Float32Array(capacity),
    pH: new Float32Array(capacity),
  });

  useEffect(() => {
    return () => {
      points.geometry.dispose();
      (points.material as Material).dispose();
    };
  }, [points]);

  const lastCell = useRef({ x: NaN, z: NaN });

  const rebuild = (px: number, pz: number) => {
    const s = state.current;
    const { cell, density } = spec;
    const cx0 = Math.floor(px / cell);
    const cz0 = Math.floor(pz / cell);
    // Collect nearby anchor cells (closest first) up to MAX_ANCHORS.
    let anchors = 0;
    const R = 4;
    for (let r = 0; r <= R && anchors < MAX_ANCHORS; r++) {
      for (let dz = -r; dz <= r && anchors < MAX_ANCHORS; dz++) {
        for (let dx = -r; dx <= r && anchors < MAX_ANCHORS; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const gx = cx0 + dx;
          const gz = cz0 + dz;
          if (cellHash(gx, gz, seed + 91) > density) continue;
          const wx = (gx + cellHash(gx, gz, seed + 1)) * cell;
          const wz = (gz + cellHash(gx, gz, seed + 2)) * cell;
          const land = landHeightAt(wx, wz, terrain, seed);
          if (terrain.lavaLevel >= 0 && land < terrain.lavaLevel) continue;
          s.ax[anchors] = wx;
          s.az[anchors] = wz;
          s.ay[anchors] = Math.max(land, terrain.waterLevel, terrain.lavaLevel) + 1;
          anchors++;
        }
      }
    }
    s.anchors = anchors;
    const count = anchors === 0 ? 0 : Math.min(capacity, anchors * visual.particles);
    s.count = count;
    for (let i = 0; i < count; i++) {
      s.pAnchor[i] = i % anchors;
      s.pAngle[i] = Math.random() * Math.PI * 2;
      s.pRadius[i] = visual.spread * Math.sqrt(Math.random());
      s.pH[i] = Math.random() * visual.height;
    }
    points.geometry.setDrawRange(0, count);
  };

  useFrame((_, dt) => {
    if (useStore.getState().sceneMode.type !== 'voxel') return;
    const px = camera.position.x;
    const pz = camera.position.z;
    const cx = Math.floor(px / spec.cell);
    const cz = Math.floor(pz / spec.cell);
    if (cx !== lastCell.current.x || cz !== lastCell.current.z) {
      lastCell.current.x = cx;
      lastCell.current.z = cz;
      rebuild(px, pz);
    }
    const s = state.current;
    if (s.count === 0) return;
    const d = Math.min(dt, 0.05);
    const arr = (points.geometry.attributes.position as BufferAttribute).array as Float32Array;
    for (let i = 0; i < s.count; i++) {
      let h = s.pH[i] + visual.rise * d;
      if (h > visual.height) h -= visual.height;
      else if (h < 0) h += visual.height;
      s.pH[i] = h;
      const ang = (s.pAngle[i] += visual.swirl * d);
      // Dust devils widen as they rise; plumes stay roughly columnar.
      const r = s.pRadius[i] * (visual.swirl > 1 ? 0.4 + h / visual.height : 1);
      const a = s.pAnchor[i];
      arr[i * 3] = s.ax[a] + Math.cos(ang) * r;
      arr[i * 3 + 1] = s.ay[a] + h;
      arr[i * 3 + 2] = s.az[a] + Math.sin(ang) * r;
    }
    (points.geometry.attributes.position as BufferAttribute).needsUpdate = true;
  });

  return <primitive object={points} />;
}

/** Moon vacuum dust: footsteps kick particles up that fall in a perfect
 *  parabola under the body's (low) gravity — no air drag. Player-anchored. */
function VacuumDust({ planet }: { planet: string }) {
  const camera = useThree((s) => s.camera);
  const budget = QUALITY[useStore((s) => s.quality)].voxelParticles;
  const capacity = Math.max(8, Math.min(budget, 60));
  const gravity = useMemo(() => getSurfacePhysics(planet).gravity * 22, [planet]);
  const visual = useMemo(() => getEmitterVisual('vacuum_dust'), []);

  const points = useMemo(
    () => makePoints(capacity, visual.color, visual.size, false),
    [capacity, visual],
  );

  const sim = useRef({
    vx: new Float32Array(capacity),
    vy: new Float32Array(capacity),
    vz: new Float32Array(capacity),
    alive: new Uint8Array(capacity),
    prev: { x: NaN, z: NaN },
    emitAcc: 0,
    next: 0,
  });

  useEffect(() => {
    points.geometry.setDrawRange(0, capacity);
    return () => {
      points.geometry.dispose();
      (points.material as Material).dispose();
    };
  }, [points, capacity]);

  useFrame((_, dt) => {
    if (useStore.getState().sceneMode.type !== 'voxel') return;
    const d = Math.min(dt, 0.05);
    const s = sim.current;
    const arr = (points.geometry.attributes.position as BufferAttribute).array as Float32Array;
    const px = camera.position.x;
    const pz = camera.position.z;
    const feetY = camera.position.y - 1.6;

    // Emit from the feet while the player is moving along the ground.
    if (Number.isFinite(s.prev.x)) {
      const speed = Math.hypot(px - s.prev.x, pz - s.prev.z) / d;
      if (speed > 1.5) {
        s.emitAcc += Math.min(speed, 9) * 1.2 * d;
        while (s.emitAcc >= 1) {
          s.emitAcc -= 1;
          const i = s.next;
          s.next = (s.next + 1) % capacity;
          s.alive[i] = 1;
          const a = Math.random() * Math.PI * 2;
          const out = 0.6 + Math.random() * 1.2;
          s.vx[i] = Math.cos(a) * out;
          s.vz[i] = Math.sin(a) * out;
          s.vy[i] = 1.5 + Math.random() * 2;
          arr[i * 3] = px + Math.cos(a) * 0.3;
          arr[i * 3 + 1] = feetY;
          arr[i * 3 + 2] = pz + Math.sin(a) * 0.3;
        }
      }
    }
    s.prev.x = px;
    s.prev.z = pz;

    // Integrate ballistic motion; retire on landing.
    for (let i = 0; i < capacity; i++) {
      if (!s.alive[i]) continue;
      s.vy[i] -= gravity * d;
      arr[i * 3] += s.vx[i] * d;
      arr[i * 3 + 1] += s.vy[i] * d;
      arr[i * 3 + 2] += s.vz[i] * d;
      if (arr[i * 3 + 1] <= feetY - 0.2) {
        s.alive[i] = 0;
        arr[i * 3 + 1] = HIDDEN_Y;
      }
    }
    (points.geometry.attributes.position as BufferAttribute).needsUpdate = true;
  });

  return <primitive object={points} />;
}

/** Renders all of a body's world-anchored emitters (Phase 10.3). */
export function Emitters({ planet }: { planet: string }) {
  const budget = QUALITY[useStore((s) => s.quality)].voxelParticles;
  const terrain = useMemo(() => getVoxelTerrain(planet), [planet]);
  const seed = useMemo(() => seedFromName(planet), [planet]);
  const emitters = useMemo(() => getContent(planet).emitters, [planet]);

  return (
    <>
      {emitters.map((spec, i) =>
        spec.kind === 'vacuum_dust' ? (
          <VacuumDust key={i} planet={planet} />
        ) : (
          <ColumnEmitterField
            key={i}
            spec={spec}
            terrain={terrain}
            seed={seed + i * 1000}
            budget={budget}
          />
        ),
      )}
    </>
  );
}

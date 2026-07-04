// World Richness Phase 8 — ambient wildlife. Modeled closely on
// Emitters.tsx's ColumnEmitterField (cell-hash anchors rebuilt only on cell
// crossing, per-instance motion computed every frame) but drives an
// InstancedMesh of small solid shapes instead of point sprites, and places
// exactly one creature per anchor rather than a particle cloud. Motion is
// simple procedural circling + vertical bob — no skeletal animation.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  InstancedMesh,
  ConeGeometry,
  IcosahedronGeometry,
  SphereGeometry,
  MeshStandardMaterial,
  Object3D,
  Color,
  type BufferGeometry,
} from 'three';
import { useStore } from '../store';
import { getWildlife, type CreatureKind, type WildlifeProfile } from './wildlifeProfiles';
import { getVoxelTerrain } from './voxelBiomes';
import { landHeightAt, localWaterCeilingAt } from './worldGen';
import { seedFromName, cellHash } from './noise';

const MAX_ANCHORS = 10; // bound active creatures per layer around the player

function makeGeometry(kind: CreatureKind): BufferGeometry {
  switch (kind) {
    case 'bird':
      return new ConeGeometry(0.5, 1.2, 3); // stylized wing silhouette
    case 'drifter':
      return new SphereGeometry(0.5, 6, 5);
    default:
      return new IcosahedronGeometry(0.5, 0);
  }
}

const dummy = new Object3D();

function CreatureField({
  profile,
  terrain,
  seed,
}: {
  profile: WildlifeProfile;
  terrain: ReturnType<typeof getVoxelTerrain>;
  seed: number;
}) {
  const camera = useThree((s) => s.camera);
  const { species } = profile;

  const mesh = useMemo(() => {
    const geo = makeGeometry(species.kind);
    const mat = new MeshStandardMaterial({
      color: new Color(...species.color),
      emissive: new Color(...species.emissive),
      emissiveIntensity: species.emissiveIntensity,
      roughness: 0.8,
      metalness: 0,
      flatShading: true,
    });
    const m = new InstancedMesh(geo, mat, MAX_ANCHORS);
    m.frustumCulled = false;
    m.castShadow = species.kind !== 'drifter';
    m.count = 0;
    return m;
  }, [species]);

  useEffect(() => {
    return () => {
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
      mesh.dispose();
    };
  }, [mesh]);

  const state = useRef({
    ax: new Float32Array(MAX_ANCHORS),
    az: new Float32Array(MAX_ANCHORS),
    ay: new Float32Array(MAX_ANCHORS),
    angle: new Float32Array(MAX_ANCHORS),
    bob: new Float32Array(MAX_ANCHORS),
    count: 0,
  });

  const lastCell = useRef({ x: NaN, z: NaN });

  const rebuild = (px: number, pz: number) => {
    const s = state.current;
    const { cell, density } = profile;
    const cx0 = Math.floor(px / cell);
    const cz0 = Math.floor(pz / cell);
    let n = 0;
    const R = 5;
    for (let r = 0; r <= R && n < MAX_ANCHORS; r++) {
      for (let dz = -r; dz <= r && n < MAX_ANCHORS; dz++) {
        for (let dx = -r; dx <= r && n < MAX_ANCHORS; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const gx = cx0 + dx;
          const gz = cz0 + dz;
          if (cellHash(gx, gz, seed + 81) > density) continue;
          const wx = (gx + cellHash(gx, gz, seed + 1)) * cell;
          const wz = (gz + cellHash(gx, gz, seed + 2)) * cell;
          const land = landHeightAt(wx, wz, terrain, seed);
          const waterCeiling = localWaterCeilingAt(wx, wz, land, terrain, seed);
          if (terrain.lavaLevel >= 0 && land < terrain.lavaLevel) continue; // in lava
          // Ground critters/drifters can't spawn underwater; birds fly above
          // the water surface regardless, so only gate the low hoverHeight.
          if (species.hoverHeight < 2 && waterCeiling >= 0 && land < waterCeiling) continue;
          s.ax[n] = wx;
          s.az[n] = wz;
          s.ay[n] = Math.max(land, waterCeiling) + species.hoverHeight;
          s.angle[n] = cellHash(gx, gz, seed + 3) * Math.PI * 2;
          s.bob[n] = cellHash(gx, gz, seed + 4) * Math.PI * 2;
          n++;
        }
      }
    }
    s.count = n;
  };

  useFrame((_, dt) => {
    if (useStore.getState().sceneMode.type !== 'voxel') return;
    const px = camera.position.x;
    const pz = camera.position.z;
    const cx = Math.floor(px / profile.cell);
    const cz = Math.floor(pz / profile.cell);
    if (cx !== lastCell.current.x || cz !== lastCell.current.z) {
      lastCell.current.x = cx;
      lastCell.current.z = cz;
      rebuild(px, pz);
    }
    const s = state.current;
    if (s.count === 0) {
      mesh.count = 0;
      return;
    }
    const d = Math.min(dt, 0.05);
    for (let i = 0; i < s.count; i++) {
      const angle = (s.angle[i] += species.speed * d);
      const bob = (s.bob[i] += species.bobSpeed * d);
      const x = s.ax[i] + Math.cos(angle) * species.radius;
      const z = s.az[i] + Math.sin(angle) * species.radius;
      const y = s.ay[i] + Math.sin(bob) * species.bobAmp;
      dummy.position.set(x, y, z);
      // Face the direction of travel (tangent to the circling path).
      dummy.rotation.set(0, -angle - Math.PI / 2, 0);
      dummy.scale.setScalar(species.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = s.count;
    mesh.instanceMatrix.needsUpdate = true;
  });

  return <primitive object={mesh} />;
}

export function VoxelWildlife({ planet }: { planet: string }) {
  const quality = useStore((s) => s.quality);
  const terrain = useMemo(() => getVoxelTerrain(planet), [planet]);
  const seed = useMemo(() => seedFromName(planet), [planet]);
  const profiles = useMemo(() => getWildlife(planet), [planet]);

  // Skip entirely on the lowest quality tier — ambient creatures are pure
  // flavour, not core gameplay, so the cheapest devices get none.
  if (profiles.length === 0 || quality === 'low') return null;

  return (
    <>
      {profiles.map((profile, i) => (
        <CreatureField key={i} profile={profile} terrain={terrain} seed={seed + i * 3000} />
      ))}
    </>
  );
}

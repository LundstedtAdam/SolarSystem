// World Richness Phase 7 — procedural trees. Mirrors VoxelScatter.tsx's
// existing instancing pattern exactly (cell-hash-deterministic placement,
// rebuild only on cell-crossing, ring-shell iteration with LOD thinning,
// InstancedMesh per visual part) rather than inventing a second placement
// system, plus a forest-coverage mask so trees cluster into groves with
// clearings instead of a uniform scatter.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  InstancedMesh,
  CylinderGeometry,
  SphereGeometry,
  MeshStandardMaterial,
  Object3D,
  Color,
} from 'three';
import { useStore } from '../store';
import { QUALITY } from '../systems/quality';
import { getTrees, type TreeProfile } from './treeProfiles';
import { getVoxelTerrain } from './voxelBiomes';
import { landHeightAt, localWaterCeilingAt } from './worldGen';
import { seedFromName, cellHash, fbm2 } from './noise';

const dummy = new Object3D();
const TRUNK_GEO = new CylinderGeometry(0.6, 1, 1, 6); // unit trunk, tapered top
const CANOPY_GEO = new SphereGeometry(1, 7, 6);

/** One tree species layer: two aligned InstancedMeshes (trunk always
 *  present, canopy only for live standing trees) sharing the same per-tree
 *  seed so a tree's parts never drift apart. */
function TreeLayer({
  profile,
  terrain,
  seed,
  max,
  viewRadius,
}: {
  profile: TreeProfile;
  terrain: ReturnType<typeof getVoxelTerrain>;
  seed: number;
  max: number;
  viewRadius: number;
}) {
  const camera = useThree((s) => s.camera);
  const { species } = profile;

  const trunkMesh = useMemo(() => {
    const mat = new MeshStandardMaterial({
      color: new Color(...species.trunkColor),
      roughness: 0.9,
      metalness: 0,
      flatShading: true,
    });
    const m = new InstancedMesh(TRUNK_GEO, mat, Math.max(1, max));
    m.frustumCulled = false;
    m.castShadow = true;
    m.receiveShadow = true;
    m.count = 0;
    return m;
  }, [species, max]);

  const canopyMesh = useMemo(() => {
    const mat = new MeshStandardMaterial({
      color: new Color(...species.canopyColor),
      emissive: new Color(...species.canopyEmissive),
      emissiveIntensity: species.canopyEmissiveIntensity,
      roughness: 0.85,
      metalness: 0,
      flatShading: true,
    });
    const m = new InstancedMesh(CANOPY_GEO, mat, Math.max(1, max));
    m.frustumCulled = false;
    m.castShadow = true;
    m.receiveShadow = true;
    m.count = 0;
    return m;
  }, [species, max]);

  useEffect(() => {
    return () => {
      (trunkMesh.material as MeshStandardMaterial).dispose();
      trunkMesh.dispose();
      (canopyMesh.material as MeshStandardMaterial).dispose();
      canopyMesh.dispose();
    };
  }, [trunkMesh, canopyMesh]);

  const lastCell = useRef({ x: NaN, z: NaN });

  const rebuild = (px: number, pz: number) => {
    const { cell, density, forestFreq, forestThreshold } = profile;
    const cx0 = Math.floor(px / cell);
    const cz0 = Math.floor(pz / cell);
    const R = Math.ceil((viewRadius * 32) / cell) + 1;
    let nTrunk = 0;
    let nCanopy = 0;
    for (let r = 0; r <= R && nTrunk < max; r++) {
      for (let dz = -r; dz <= r && nTrunk < max; dz++) {
        for (let dx = -r; dx <= r && nTrunk < max; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; // ring shell
          const gx = cx0 + dx;
          const gz = cz0 + dz;
          if (cellHash(gx, gz, seed + 61) > density) continue;
          // LOD: thin distant trees so far rings cost less than near ones.
          if (r > R * 0.6 && cellHash(gx, gz, seed + 62) > 0.5) continue;
          const wx = (gx + cellHash(gx, gz, seed + 1)) * cell;
          const wz = (gz + cellHash(gx, gz, seed + 2)) * cell;
          // Forest-coverage mask: only grow within coherent groves, not a
          // uniform carpet — the same low-frequency fbm2 primitive used
          // everywhere else in worldgen, evaluated at world position.
          const coverage = fbm2(wx * forestFreq, wz * forestFreq, seed + 7001, 2);
          if (coverage < forestThreshold) continue;
          const land = landHeightAt(wx, wz, terrain, seed);
          const waterCeiling = localWaterCeilingAt(wx, wz, land, terrain, seed);
          if (waterCeiling >= 0 && land < waterCeiling) continue; // underwater
          if (terrain.lavaLevel >= 0 && land < terrain.lavaLevel) continue; // in lava

          const heightT = cellHash(gx, gz, seed + 3);
          const height = species.minHeight + heightT * (species.maxHeight - species.minHeight);
          const isFallen = cellHash(gx, gz, seed + 4) < species.fallenChance;
          const isDead = !isFallen && cellHash(gx, gz, seed + 5) < species.deadChance;
          const yaw = cellHash(gx, gz, seed + 6) * Math.PI * 2;

          if (isFallen) {
            // Trunk lying on the ground, pointing in a random direction —
            // reuses the standing-trunk geometry, just reoriented, so no
            // separate "fallen" part is needed.
            dummy.position.set(wx, land + species.trunkRadius * 1.4, wz);
            dummy.rotation.set(0, yaw, Math.PI / 2);
            dummy.scale.set(species.trunkRadius * 1.4, height, species.trunkRadius * 1.4);
          } else {
            dummy.position.set(wx, land + height / 2, wz);
            dummy.rotation.set(0, yaw, 0);
            dummy.scale.set(species.trunkRadius, height, species.trunkRadius);
          }
          dummy.updateMatrix();
          trunkMesh.setMatrixAt(nTrunk, dummy.matrix);
          nTrunk++;

          if (!isFallen && !isDead && nCanopy < max) {
            const canopyR = height * species.canopyRadiusFactor;
            dummy.position.set(wx, land + height + canopyR * 0.5, wz);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(canopyR, canopyR, canopyR);
            dummy.updateMatrix();
            canopyMesh.setMatrixAt(nCanopy, dummy.matrix);
            nCanopy++;
          }
        }
      }
    }
    trunkMesh.count = nTrunk;
    trunkMesh.instanceMatrix.needsUpdate = true;
    canopyMesh.count = nCanopy;
    canopyMesh.instanceMatrix.needsUpdate = true;
  };

  useFrame(() => {
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
  });

  return (
    <>
      <primitive object={trunkMesh} />
      <primitive object={canopyMesh} />
    </>
  );
}

export function VoxelTrees({ planet }: { planet: string }) {
  const quality = QUALITY[useStore((s) => s.quality)];
  const viewRadius = quality.voxelViewRadius;

  const terrain = useMemo(() => getVoxelTerrain(planet), [planet]);
  const seed = useMemo(() => seedFromName(planet), [planet]);
  const profiles = useMemo(() => getTrees(planet), [planet]);

  if (profiles.length === 0) return null;

  const perLayerMax = Math.max(1, Math.floor(quality.voxelTrees / profiles.length));

  return (
    <>
      {profiles.map((profile, i) => (
        <TreeLayer
          key={i}
          profile={profile}
          terrain={terrain}
          seed={seed + i * 2000}
          max={perLayerMax}
          viewRadius={viewRadius}
        />
      ))}
    </>
  );
}

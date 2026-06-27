import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  InstancedMesh,
  IcosahedronGeometry,
  OctahedronGeometry,
  ConeGeometry,
  SphereGeometry,
  MeshStandardMaterial,
  Object3D,
  Color,
  type BufferGeometry,
} from 'three';
import { useStore } from '../store';
import { QUALITY } from '../systems/quality';
import { getScatter, type ScatterKind } from './scatterProfiles';
import { getVoxelTerrain } from './voxelBiomes';
import { landHeightAt } from './worldGen';
import { seedFromName, cellHash } from './noise';

function makeGeometry(kind: ScatterKind): BufferGeometry {
  switch (kind) {
    case 'crystal':
      return new OctahedronGeometry(0.5, 0);
    case 'spire':
      return new ConeGeometry(0.4, 1, 5);
    case 'fungus':
      return new SphereGeometry(0.5, 6, 5);
    default:
      return new IcosahedronGeometry(0.5, 0);
  }
}

const dummy = new Object3D();

// Deterministic instanced props on the terrain surface around the player.
// Positions are hashed per scatter cell so a prop at a world spot is always the
// same; the instance set is rebuilt only when the player moves between cells.
export function VoxelScatter({ planet }: { planet: string }) {
  const camera = useThree((s) => s.camera);
  const quality = QUALITY[useStore((s) => s.quality)];
  const max = quality.voxelScatter;
  const viewRadius = quality.voxelViewRadius;

  const profile = useMemo(() => getScatter(planet), [planet]);
  const terrain = useMemo(() => getVoxelTerrain(planet), [planet]);
  const seed = useMemo(() => seedFromName(planet), [planet]);

  const mesh = useMemo(() => {
    const geo = makeGeometry(profile.kind);
    const mat = new MeshStandardMaterial({
      color: new Color(...profile.color),
      emissive: new Color(...profile.emissive),
      emissiveIntensity: profile.emissiveIntensity,
      roughness: 0.85,
      metalness: 0,
      flatShading: true,
    });
    const m = new InstancedMesh(geo, mat, Math.max(1, max));
    m.frustumCulled = false; // props are world-positioned around the player
    m.castShadow = true;
    m.receiveShadow = true;
    m.count = 0;
    return m;
  }, [profile, max]);

  useEffect(() => {
    return () => {
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
      mesh.dispose();
    };
  }, [mesh]);

  const lastCell = useRef({ x: NaN, z: NaN });

  const rebuild = (px: number, pz: number) => {
    const { cell, density, minScale, maxScale, scaleXYZ, yFactor } = profile;
    const cx0 = Math.floor(px / cell);
    const cz0 = Math.floor(pz / cell);
    const R = Math.ceil((viewRadius * 32) / cell) + 1;
    let n = 0;
    for (let r = 0; r <= R && n < max; r++) {
      for (let dz = -r; dz <= r && n < max; dz++) {
        for (let dx = -r; dx <= r && n < max; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; // ring shell
          const gx = cx0 + dx;
          const gz = cz0 + dz;
          if (cellHash(gx, gz, seed + 71) > density) continue;
          const wx = (gx + cellHash(gx, gz, seed + 1)) * cell;
          const wz = (gz + cellHash(gx, gz, seed + 2)) * cell;
          const land = landHeightAt(wx, wz, terrain, seed);
          if (terrain.waterLevel >= 0 && land < terrain.waterLevel) continue; // underwater
          if (terrain.lavaLevel >= 0 && land < terrain.lavaLevel) continue; // in lava
          const s = minScale + cellHash(gx, gz, seed + 3) * (maxScale - minScale);
          dummy.position.set(wx, land + s * yFactor, wz);
          dummy.rotation.set(
            (cellHash(gx, gz, seed + 5) - 0.5) * 0.4,
            cellHash(gx, gz, seed + 4) * Math.PI * 2,
            (cellHash(gx, gz, seed + 6) - 0.5) * 0.4,
          );
          dummy.scale.set(s * scaleXYZ[0], s * scaleXYZ[1], s * scaleXYZ[2]);
          dummy.updateMatrix();
          mesh.setMatrixAt(n, dummy.matrix);
          n++;
        }
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
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

  return <primitive object={mesh} />;
}

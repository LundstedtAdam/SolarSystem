import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  InstancedMesh,
  IcosahedronGeometry,
  OctahedronGeometry,
  ConeGeometry,
  SphereGeometry,
  BoxGeometry,
  MeshStandardMaterial,
  Object3D,
  Color,
  type BufferGeometry,
} from 'three';
import { useStore } from '../store';
import { QUALITY } from '../systems/quality';
import { getScatter, type ScatterKind, type ScatterProfile } from './scatterProfiles';
import { getContent } from './contentProfiles';
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
    case 'slab':
      return new BoxGeometry(1, 1, 1); // flattened via scaleXYZ into layered slabs
    default:
      return new IcosahedronGeometry(0.5, 0);
  }
}

const dummy = new Object3D();

// Deterministic instanced props on the terrain surface around the player. Each
// prop kind is its own InstancedMesh (PropLayer): positions are hashed per
// scatter cell so a prop at a world spot is always the same, and the instance
// set is rebuilt only when the player crosses a cell boundary. A per-layer seed
// offset keeps the kinds from stacking on identical cells.
function PropLayer({
  profile,
  terrain,
  seed,
  max,
  viewRadius,
}: {
  profile: ScatterProfile;
  terrain: ReturnType<typeof getVoxelTerrain>;
  seed: number;
  max: number;
  viewRadius: number;
}) {
  const camera = useThree((s) => s.camera);

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

export function VoxelScatter({ planet }: { planet: string }) {
  const quality = QUALITY[useStore((s) => s.quality)];
  const viewRadius = quality.voxelViewRadius;

  const terrain = useMemo(() => getVoxelTerrain(planet), [planet]);
  const seed = useMemo(() => seedFromName(planet), [planet]);

  // Authored per-body props (Phase 10) take priority; otherwise fall back to the
  // archetype scatter so every body keeps its existing single prop.
  const profiles = useMemo(() => {
    const authored = getContent(planet).props;
    return authored.length > 0 ? authored : [getScatter(planet)];
  }, [planet]);

  // Split the instance budget across the prop layers.
  const perLayerMax = Math.max(1, Math.floor(quality.voxelScatter / profiles.length));

  return (
    <>
      {profiles.map((profile, i) => (
        <PropLayer
          key={i}
          profile={profile}
          terrain={terrain}
          seed={seed + i * 1000}
          max={perLayerMax}
          viewRadius={viewRadius}
        />
      ))}
    </>
  );
}

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  InstancedMesh,
  IcosahedronGeometry,
  OctahedronGeometry,
  ConeGeometry,
  SphereGeometry,
  BoxGeometry,
  CylinderGeometry,
  BufferGeometry,
  MeshStandardMaterial,
  Object3D,
  Color,
  DoubleSide,
} from 'three';
import { useStore } from '../store';
import { QUALITY } from '../systems/quality';
import { getScatter, getGroundClutter, type ScatterKind, type ScatterProfile } from './scatterProfiles';
import { getContent } from './contentProfiles';
import { getVoxelTerrain, latitudeOf } from './voxelBiomes';
import { landHeightAt, oreAt, localWaterCeilingAt } from './worldGen';
import { seedFromName, cellHash } from './noise';
import { getBladeAlphaTexture } from './textureAtlas';
import { crossedQuadGeometry } from './scatterGeometry';

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
    case 'blade':
      return crossedQuadGeometry(0.4, 0.5); // grass tufts / weeds billboard
    case 'branch': {
      // A thin cylinder pre-rotated to lie on its side — reused as a fallen
      // branch/root on Earth, or a loose debris sliver on other archetypes.
      const g = new CylinderGeometry(0.06, 0.08, 1, 5);
      g.rotateZ(Math.PI / 2);
      return g;
    }
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
    const isBlade = profile.kind === 'blade';
    const mat = new MeshStandardMaterial({
      color: new Color(...profile.color),
      emissive: new Color(...profile.emissive),
      emissiveIntensity: profile.emissiveIntensity,
      roughness: 0.85,
      metalness: 0,
      flatShading: true,
      // Billboard blades are a single-sided plane pair — double-side them so
      // grass reads from both approach directions instead of vanishing, and
      // alpha-cutout them to an actual blade silhouette (white RGB texture,
      // material.color tints it) instead of a solid colored rectangle.
      // alphaTest (not `transparent`) keeps the cutout a cheap, sort-free
      // hard edge, consistent with the rest of the voxel rendering.
      ...(isBlade ? { side: DoubleSide, map: getBladeAlphaTexture(), alphaTest: 0.5 } : {}),
    });
    const m = new InstancedMesh(geo, mat, Math.max(1, max));
    m.frustumCulled = false; // props are world-positioned around the player
    // Thin grass cards casting shadows is a lot of shadow-map cost for very
    // little visual payoff at this density — skip it for blades only.
    m.castShadow = !isBlade;
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
          // LOD: thin out distant props so far rings cost less than near ones.
          // Stable as the player moves (rebuild is per cell-crossing), so no pop.
          if (r > R * 0.6 && cellHash(gx, gz, seed + 99) > 0.5) continue;
          const wx = (gx + cellHash(gx, gz, seed + 1)) * cell;
          const wz = (gz + cellHash(gx, gz, seed + 2)) * cell;
          const land = landHeightAt(wx, wz, terrain, seed);
          // Local water ceiling (World Richness Phase 6) — the higher of the
          // global sea and any lake/river's own rim active here, so scatter
          // correctly avoids/hugs the new procedural water bodies too, not
          // just the pre-existing earth-archetype global sea.
          const waterCeiling = localWaterCeilingAt(wx, wz, land, terrain, seed);
          if (waterCeiling >= 0 && land < waterCeiling) continue; // underwater
          if (terrain.lavaLevel >= 0 && land < terrain.lavaLevel) continue; // in lava
          // Shoreline/wetland dressing: only within a couple voxels of the
          // water surface, on either side (reeds need shore, not open water).
          if (
            profile.waterAdjacent &&
            !(waterCeiling >= 0 && land >= waterCeiling - 2 && land <= waterCeiling + 1)
          ) {
            continue;
          }
          // Ore tell: only where a vein actually surfaces a few voxels down —
          // reuses the exact same oreAt() worldgen and the orbital scanner
          // already agree on, so the hint never lies about what's below.
          if (profile.oreTell) {
            const ix = Math.round(wx);
            const iz = Math.round(wz);
            const iy = Math.round(land);
            let veined = false;
            for (let d = 2; d <= 5 && !veined; d++) {
              if (oreAt(d, ix, iy - d, iz, terrain, seed) >= 0) veined = true;
            }
            if (!veined) continue;
          }
          // Gradual biome transition: living ground cover thins toward the
          // flat-world "poles" instead of forming a uniform carpet end to end.
          if (profile.latitudeFalloff && cellHash(gx, gz, seed + 88) < latitudeOf(wz) * 0.85) {
            continue;
          }
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

  // Every body layers: fine ground clutter (always), the per-archetype
  // feature scatter (always), then any authored per-body accent props on
  // top (World Richness Phase 2 — additive so authored bodies like Mars keep
  // their curated look and gain density rather than losing the archetype
  // baseline they used to replace).
  const profiles = useMemo(
    () => [...getGroundClutter(planet), getScatter(planet), ...getContent(planet).props],
    [planet],
  );

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

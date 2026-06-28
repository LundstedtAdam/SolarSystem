import { useMemo, useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Color, DirectionalLight, Vector3 } from 'three';
import { useStore } from '../store';
import { QUALITY } from '../systems/quality';
import { getBiome } from '../terrain/biomes';
import { ChunkManager } from './ChunkManager';
import { VoxelSky } from './VoxelSky';
import { VoxelWeather } from './VoxelWeather';
import { VoxelScatter } from './VoxelScatter';
import { Emitters } from './Emitters';
import { DropItems } from './DropItems';
import { SiloVisuals } from './SiloVisuals';
import { PlayerController } from './PlayerController';
import type { VoxelApi } from './player';

// Phase 9.3: the voxel world is a streamed chunk field at the world origin
// (kept near 0 to avoid float precision loss far from the ship). Lighting and
// backdrop come from the shared biome so it reads as the same body. The
// PlayerController walks an AABB through the voxels with per-body gravity.

/** Sun key light: matches the biome sun, follows the camera so its shadow
 *  frustum tracks the player, and casts voxel shadows when quality allows. */
function SunLight({ planet }: { planet: string }) {
  const q = QUALITY[useStore((s) => s.quality)];
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const sunIntensity = useMemo(() => getBiome(planet).sunIntensity, [planet]);
  const dir = useMemo(() => new Vector3(0.3, 0.6, 0.4).normalize(), []);
  const light = useMemo(() => new DirectionalLight(0xfff8f0, sunIntensity), [sunIntensity]);

  useEffect(() => {
    light.castShadow = q.shadows;
    const size = 96;
    const cam = light.shadow.camera;
    cam.left = -size; cam.right = size; cam.top = size; cam.bottom = -size;
    cam.near = 1; cam.far = 420;
    cam.updateProjectionMatrix();
    light.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
    light.shadow.bias = -0.0005;
    light.shadow.normalBias = 0.6;
    scene.add(light);
    scene.add(light.target);
    return () => {
      scene.remove(light);
      scene.remove(light.target);
      light.dispose();
    };
  }, [light, q.shadows, q.shadowMapSize, scene]);

  useFrame(() => {
    light.position.copy(camera.position).addScaledVector(dir, 200);
    light.target.position.copy(camera.position);
    light.target.updateMatrixWorld();
  });

  return null;
}

export function VoxelScene() {
  const sceneMode = useStore((s) => s.sceneMode);
  const planet = sceneMode.type === 'voxel' ? sceneMode.planet : '';
  const scene = useThree((s) => s.scene);
  const apiRef = useRef<VoxelApi | null>(null);

  const { ambientColor, ambientIntensity, horizon } = useMemo(() => {
    const b = getBiome(planet);
    return {
      ambientColor: new Color(...b.ambientColor),
      ambientIntensity: b.ambientIntensity,
      horizon: new Color(...b.skyHorizon),
    };
  }, [planet]);

  // Voxel mode owns the scene backdrop; restore it on exit so space view is clean.
  useEffect(() => {
    const prev = scene.background;
    scene.background = horizon;
    return () => {
      scene.background = prev;
    };
  }, [scene, horizon]);

  if (sceneMode.type !== 'voxel') return null;

  return (
    <>
      <ChunkManager planet={planet} apiRef={apiRef} />
      <VoxelSky planet={planet} />
      <VoxelScatter planet={planet} />
      <Emitters planet={planet} />
      <DropItems planet={planet} />
      <SiloVisuals planet={planet} />
      <VoxelWeather planet={planet} />
      <ambientLight intensity={ambientIntensity} color={ambientColor} />
      <SunLight planet={planet} />
      <PlayerController planet={planet} apiRef={apiRef} />
    </>
  );
}

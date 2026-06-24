import { useMemo } from 'react';
import { PlaneGeometry } from 'three';
import { useStore } from '../store';
import { QUALITY } from '../systems/quality';
import { getBiome } from './biomes';
import { createTerrainMaterial } from './terrainMaterial';

const TERRAIN_EXTENT = 400;

export function TerrainMesh({ planet }: { planet: string }) {
  const quality = useStore((s) => s.quality);
  const q = QUALITY[quality];
  const res = q.terrainResolution;

  const biome = useMemo(() => getBiome(planet), [planet]);

  const geometry = useMemo(() => {
    return new PlaneGeometry(TERRAIN_EXTENT, TERRAIN_EXTENT, res, res);
  }, [res]);

  const material = useMemo(() => {
    return createTerrainMaterial(biome, q.terrainNoiseOctaves);
  }, [biome, q.terrainNoiseOctaves]);

  return (
    <mesh
      geometry={geometry}
      material={material}
      rotation={[-Math.PI / 2, 0, 0]}
    />
  );
}

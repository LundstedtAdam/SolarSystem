import { useMemo } from 'react';
import { PlaneGeometry } from 'three';
import { useStore } from '../store';
import { getBiome } from './biomes';
import { createTerrainMaterial } from './terrainMaterial';

const TERRAIN_RES: Record<string, number> = {
  low: 128,
  medium: 256,
  high: 512,
  ultra: 1024,
};

const TERRAIN_EXTENT = 400;

export function TerrainMesh({ planet }: { planet: string }) {
  const quality = useStore((s) => s.quality);
  const res = TERRAIN_RES[quality] ?? 256;

  const biome = useMemo(() => getBiome(planet), [planet]);

  const geometry = useMemo(() => {
    return new PlaneGeometry(TERRAIN_EXTENT, TERRAIN_EXTENT, res, res);
  }, [res]);

  const material = useMemo(() => {
    return createTerrainMaterial(biome);
  }, [biome]);

  return (
    <mesh
      geometry={geometry}
      material={material}
      rotation={[-Math.PI / 2, 0, 0]}
    />
  );
}

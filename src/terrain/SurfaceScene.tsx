import { useMemo } from 'react';
import { Color } from 'three';
import { useStore } from '../store';
import { TerrainMesh } from './TerrainMesh';
import { Sky } from './Sky';
import { SurfaceCamera } from './SurfaceCamera';
import { ShipModel } from '../ship/ShipModel';
import { getBiome } from './biomes';

export function SurfaceScene() {
  const sceneMode = useStore((s) => s.sceneMode);
  const planet = sceneMode.type === 'surface' ? sceneMode.planet : '';
  const [px, py, pz] = useStore((s) => s.shipPosition);

  // Per-body lighting: ambient (shadow fill) tinted to the atmosphere and a key
  // light whose intensity sets the contrast (harsh on airless worlds, near
  // shadowless under thick haze).
  const { ambientColor, ambientIntensity, sunIntensity } = useMemo(() => {
    const b = getBiome(planet);
    return {
      ambientColor: new Color(...b.ambientColor),
      ambientIntensity: b.ambientIntensity,
      sunIntensity: b.sunIntensity,
    };
  }, [planet]);

  if (sceneMode.type !== 'surface') return null;

  return (
    <>
      <group position={[px, py, pz]}>
        <TerrainMesh planet={sceneMode.planet} />
        <Sky planet={sceneMode.planet} />
        <ambientLight intensity={ambientIntensity} color={ambientColor} />
        <directionalLight
          position={[120, 220, 160]}
          intensity={sunIntensity}
          color={0xfff8f0}
        />
      </group>
      <group position={[px, py + 1, pz]}>
        <ShipModel />
      </group>
      <SurfaceCamera />
    </>
  );
}

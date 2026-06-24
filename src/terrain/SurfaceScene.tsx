import { useStore } from '../store';
import { TerrainMesh } from './TerrainMesh';
import { Sky } from './Sky';
import { SurfaceCamera } from './SurfaceCamera';
import { ShipModel } from '../ship/ShipModel';

export function SurfaceScene() {
  const sceneMode = useStore((s) => s.sceneMode);
  if (sceneMode.type !== 'surface') return null;

  const [px, py, pz] = useStore((s) => s.shipPosition);

  return (
    <>
      <group position={[px, py, pz]}>
        <TerrainMesh planet={sceneMode.planet} />
        <Sky planet={sceneMode.planet} />
        <ambientLight intensity={0.15} color={0xccccdd} />
        <directionalLight
          position={[100, 200, 150]}
          intensity={1.2}
          color={0xfff8f0}
        />
      </group>
      <group position={[px, py + 2, pz]}>
        <ShipModel />
      </group>
      <SurfaceCamera />
    </>
  );
}

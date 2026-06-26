import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MeshBasicNodeMaterial, BackSide } from 'three/webgpu';
import { normalLocal, vec3, mix, smoothstep, float } from 'three/tsl';
import { Mesh } from 'three';
import { getBiome } from '../terrain/biomes';

// Voxel-owned sky dome. Mirrors the Phase 8 terrain Sky gradient + sun disc
// (same biome zenith/horizon/sun) so the two systems look identical, but is
// independent code per the separate-rendering-systems constraint. Follows the
// camera so the streamed voxel world never reaches the dome edge.
export function VoxelSky({ planet }: { planet: string }) {
  const camera = useThree((s) => s.camera);
  const ref = useRef<Mesh>(null);
  const biome = useMemo(() => getBiome(planet), [planet]);

  const material = useMemo(() => {
    const m = new MeshBasicNodeMaterial();
    m.side = BackSide;
    m.depthWrite = false;

    const up = normalLocal.y;
    const zenith = vec3(...biome.skyZenith);
    const horizon = vec3(...biome.skyHorizon);
    const ground = horizon.mul(0.3);

    const skyGrad = mix(horizon, zenith, smoothstep(0.0, 0.8, up));
    const full = mix(ground, skyGrad, smoothstep(-0.1, 0.05, up));

    if (biome.skyHasSun) {
      const sunDir = vec3(0.3, 0.6, 0.4).normalize();
      const sunDot = normalLocal.normalize().dot(sunDir).max(0);
      const sunDisc = smoothstep(0.997, 0.999, sunDot).mul(float(8.0));
      const sunGlow = sunDot.pow(128).mul(float(0.6));
      m.colorNode = full.add(vec3(1.0, 0.95, 0.85).mul(sunDisc.add(sunGlow)));
    } else {
      m.colorNode = full;
    }
    return m;
  }, [biome]);

  useFrame(() => {
    if (ref.current) ref.current.position.copy(camera.position);
  });

  return (
    <mesh ref={ref} scale={800} renderOrder={-1}>
      <sphereGeometry args={[1, 32, 16]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

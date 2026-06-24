import { useMemo } from 'react';
import { MeshBasicNodeMaterial, BackSide } from 'three/webgpu';
import { normalLocal, vec3, mix, smoothstep, float } from 'three/tsl';
import { getBiome } from './biomes';

export function Sky({ planet }: { planet: string }) {
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

  return (
    <mesh scale={500} renderOrder={-1}>
      <sphereGeometry args={[1, 32, 16]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

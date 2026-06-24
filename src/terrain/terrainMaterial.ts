import { MeshStandardNodeMaterial } from 'three/webgpu';
import {
  positionLocal,
  float,
  vec3,
  mix,
  smoothstep,
  normalLocal,
  mx_fractal_noise_float,
  mx_worley_noise_float,
  uniform,
} from 'three/tsl';
import type { BiomeProfile } from './biomes';

export function createTerrainMaterial(biome: BiomeProfile): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial();

  const pos = positionLocal;

  const continent = mx_fractal_noise_float(
    pos.mul(biome.continentFreq),
    float(biome.octaves),
    float(biome.lacunarity),
    float(biome.diminish),
    float(biome.continentAmp),
  );

  const mountain = mx_fractal_noise_float(
    pos.mul(biome.mountainFreq),
    float(Math.max(biome.octaves - 1, 2)),
    float(biome.lacunarity),
    float(biome.diminish),
    float(biome.mountainAmp),
  );

  const detail = mx_fractal_noise_float(
    pos.mul(biome.detailFreq),
    float(2),
    float(2.0),
    float(0.5),
    float(biome.detailAmp),
  );

  let height = continent.add(mountain).add(detail);

  if (biome.craterStrength > 0.05) {
    const craters = mx_worley_noise_float(
      pos.mul(0.008),
      float(1.0),
    );
    height = height.sub(craters.mul(biome.craterStrength * 20));
  }

  m.positionNode = pos.add(normalLocal.mul(height));

  const heightNorm = smoothstep(-15, 25, height);
  const polarFactor = smoothstep(0.3, 0.9, positionLocal.z.abs().div(200));

  const cLow = vec3(...biome.colorLow);
  const cMid = vec3(...biome.colorMid);
  const cHigh = vec3(...biome.colorHigh);
  const cPolar = vec3(...biome.colorPolar);

  const baseColor = mix(mix(cLow, cMid, smoothstep(0.0, 0.4, heightNorm)),
    cHigh, smoothstep(0.5, 1.0, heightNorm));
  const finalColor = mix(baseColor, cPolar, polarFactor);

  m.colorNode = finalColor;
  m.metalnessNode = float(0);
  m.roughnessNode = mix(float(biome.roughnessLow), float(biome.roughnessHigh), heightNorm);

  if (biome.fogDensity > 0) {
    const fogU = uniform(biome.fogDensity);
    const fogCol = vec3(...biome.fogColor);
    const dist = positionLocal.length().mul(0.005);
    const fogFactor = smoothstep(0.0, 1.0, dist.mul(fogU));
    m.colorNode = mix(finalColor, fogCol, fogFactor);
  }

  return m;
}

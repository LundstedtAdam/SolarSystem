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

  // Normalize the elevation to [0,1] against THIS biome's own relief so the full
  // colour ramp is exercised on every body — a fixed window would clamp
  // low-relief worlds (Europa, Deimos) to a single colour and let only
  // high-relief worlds (Mars) show their ramp.
  const relief = Math.max(biome.continentAmp + biome.mountainAmp * 0.5, 6);
  const heightNorm = smoothstep(float(-relief * 0.7), float(relief * 0.9), height);

  const cLow = vec3(...biome.colorLow);
  const cMid = vec3(...biome.colorMid);
  const cHigh = vec3(...biome.colorHigh);
  const cPolar = vec3(...biome.colorPolar);

  // Low ground -> mid terrain -> high terrain, then the polar/cap colour blends
  // in only at the highest elevations (ice peaks, bright deposits). The old
  // latitude term read positionLocal.z, which on the unrotated plane is the
  // displacement axis (~0), so colorPolar never appeared.
  const lowMid = mix(cLow, cMid, smoothstep(0.0, 0.45, heightNorm));
  const baseColor = mix(lowMid, cHigh, smoothstep(0.55, 0.92, heightNorm));
  const finalColor = mix(baseColor, cPolar, smoothstep(0.9, 1.0, heightNorm));

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

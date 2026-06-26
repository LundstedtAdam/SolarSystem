// AAA voxel surface material (TSL / WebGPU). Albedo carries the mesher's baked
// ambient occlusion; on top we add subtle normal jitter so the flat voxel faces
// catch light unevenly (kills the "vanilla Minecraft" look) and biome fog that
// matches the Phase 8 surface exactly (same fogColor/density, same falloff).
//
// Lighting (ambient fill + sun directional + shadows) comes from the scene,
// like the Phase 8 surface — this material just shapes albedo, normal, fog.

import { MeshStandardNodeMaterial } from 'three/webgpu';
import {
  attribute,
  vec3,
  float,
  mix,
  smoothstep,
  normalLocal,
  normalize,
  positionWorld,
  positionView,
  mx_fractal_noise_vec3,
} from 'three/tsl';
import type { BiomeProfile } from '../terrain/biomes';

export function createVoxelMaterial(biome: BiomeProfile): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial();

  // Baked-AO vertex colour from the greedy mesher.
  const albedo = attribute('color', 'vec3');

  // Break up flat faces: a low-amplitude world-space normal perturbation. Kept
  // small so lighting stays clean but faces no longer read as mirror-flat.
  const jitter = mx_fractal_noise_vec3(
    positionWorld.mul(0.6),
    float(2),
    float(2.0),
    float(0.5),
    float(1.0),
  ).mul(0.12);
  m.normalNode = normalize(normalLocal.add(jitter));

  // Biome fog — same math and 0.005 distance scale as terrainMaterial.ts, but
  // keyed off camera distance (view-space) since voxel chunks aren't centred.
  if (biome.fogDensity > 0) {
    const fogCol = vec3(...biome.fogColor);
    const dist = positionView.length().mul(0.005);
    const fogFactor = smoothstep(float(0), float(1), dist.mul(biome.fogDensity));
    m.colorNode = mix(albedo, fogCol, fogFactor);
  } else {
    m.colorNode = albedo;
  }

  m.metalnessNode = float(0);
  m.roughnessNode = float(biome.roughnessHigh);

  return m;
}

// AAA voxel surface material (TSL / WebGPU). Albedo carries the mesher's baked
// ambient occlusion; on top we add subtle normal jitter so the flat voxel faces
// catch light unevenly (kills the "vanilla Minecraft" look) and biome fog that
// matches the Phase 8 surface exactly (same fogColor/density, same falloff).
//
// Lighting (ambient fill + sun directional + shadows) comes from the scene,
// like the Phase 8 surface — this material just shapes albedo, normal, fog.

import { DoubleSide, MeshStandardNodeMaterial } from 'three/webgpu';
import {
  attribute,
  vec2,
  vec3,
  float,
  mix,
  mod,
  floor,
  fract,
  smoothstep,
  abs,
  normalLocal,
  normalize,
  positionWorld,
  positionView,
  texture,
  mx_fractal_noise_vec3,
} from 'three/tsl';
import type { BiomeProfile } from '../terrain/biomes';
import { LATITUDE_SPAN } from './voxelBiomes';
import { getMaterialAtlasTexture, ATLAS_GRID } from './textureAtlas';

/** True if this body actually authored a distinct polar colour (most bodies
 *  just repeat colorHigh) — skips the blend entirely, at zero cost, on
 *  bodies that didn't, so nothing regresses their existing look. */
function hasPolarColor(biome: BiomeProfile): boolean {
  const [ph, pg, pb] = biome.colorPolar;
  const [hh, hg, hb] = biome.colorHigh;
  return Math.abs(ph - hh) + Math.abs(pg - hg) + Math.abs(pb - hb) > 0.02;
}

export function createVoxelMaterial(biome: BiomeProfile): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial();

  // Vertex colour is RGBA: rgb = biome tint with baked AO, a = emissive
  // strength (lava, glowing ice). Emissive isn't AO-darkened so it reads in
  // shadow/caves.
  const vcol = attribute('color', 'vec4');

  // Material Identity pass — the mesher bakes a per-vertex (uLocal, vLocal,
  // tileIndex) attribute (see greedyMesh.ts's emitQuad); sample the shared
  // procedural atlas so every block's primary visual identity is a real
  // material texture, not just a flat colour. The vertex colour above (now
  // diluted toward white for natural blocks in greedyMesh.ts) multiplies on
  // top as the biome-tint overlay — material identity stays primary.
  const materialUV = attribute('materialUV', 'vec3');
  const tileGrid = float(ATLAS_GRID);
  const tileSize = float(1 / ATLAS_GRID);
  const tileOrigin = vec2(mod(materialUV.z, tileGrid), floor(materialUV.z.div(tileGrid))).mul(tileSize);
  const atlasUV = tileOrigin.add(fract(materialUV.xy).mul(tileSize));
  const texColor = texture(getMaterialAtlasTexture(), atlasUV);

  // Re-swizzled (a harmless no-op) so `albedo`'s inferred type stays the same
  // broad shader-node shape as every later reassignment (mix() for the polar
  // blend and fog) — .mul()'s own return type is narrower and would otherwise
  // reject those reassignments.
  let albedo = texColor.rgb.mul(vcol.xyz).rgb;

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

  // World Richness Phase 5 — gradual blend toward the body's own colorPolar
  // near the flat-world "poles" (world-Z distance from the equator; see
  // LATITUDE_SPAN in voxelBiomes.ts). Applied before fog so both compose
  // naturally. Pure shader-graph addition — never touches the per-block
  // palette or the mesher/worker transfer contract.
  if (hasPolarColor(biome)) {
    const polar = vec3(...biome.colorPolar);
    const dist = abs(positionWorld.z);
    const latT = smoothstep(float(LATITUDE_SPAN * 0.4), float(LATITUDE_SPAN), dist);
    albedo = mix(albedo, polar, latT);
  }

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

  // Self-illumination for lava / glowing ice, scaled by the per-vertex flag.
  m.emissiveNode = albedo.mul(vcol.w).mul(1.6);

  m.metalnessNode = float(0);
  m.roughnessNode = float(biome.roughnessHigh);

  return m;
}

/** Translucent water surface (Minecraft-style). Same vertex-colour base as the
 *  terrain material (the mesher's water pass carries the per-body palette
 *  colour), but see-through, glossy, double-sided (visible from below) and
 *  without depth writes so the terrain behind stays visible. */
export function createVoxelWaterMaterial(biome: BiomeProfile): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial();
  const vcol = attribute('color', 'vec4');
  const albedo = vcol.xyz;

  if (biome.fogDensity > 0) {
    const fogCol = vec3(...biome.fogColor);
    const dist = positionView.length().mul(0.005);
    const fogFactor = smoothstep(float(0), float(1), dist.mul(biome.fogDensity));
    m.colorNode = mix(albedo, fogCol, fogFactor);
  } else {
    m.colorNode = albedo;
  }

  m.metalnessNode = float(0);
  m.roughnessNode = float(0.15);
  m.transparent = true;
  m.opacity = 0.72;
  m.depthWrite = false;
  m.side = DoubleSide;

  return m;
}

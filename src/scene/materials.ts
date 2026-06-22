import { MeshStandardNodeMaterial } from 'three/webgpu';
import type { Texture } from 'three';
import {
  texture as textureNode,
  normalMap,
  positionWorld,
  normalWorld,
  float,
  mix,
  smoothstep,
} from 'three/tsl';
import type { PlanetData } from '../systems/bodies';

export interface BodyTextures {
  map: Texture;
  night?: Texture;
  normal?: Texture;
  specular?: Texture;
}

/**
 * Earth: day map, real normal map, ocean-vs-land roughness from the specular
 * mask, and night-side city lights that fade across the terminator (computed
 * from the sun direction — the sun sits at the world origin).
 */
function createEarthMaterial(tex: BodyTextures): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial();
  m.colorNode = textureNode(tex.map);
  if (tex.normal) m.normalNode = normalMap(textureNode(tex.normal));
  m.metalnessNode = float(0);
  if (tex.specular) {
    const ocean = textureNode(tex.specular).r; // bright = water
    m.roughnessNode = mix(float(0.9), float(0.2), ocean); // land matte, seas glossy
  } else {
    m.roughnessNode = float(0.85);
  }
  if (tex.night) {
    const sunDir = positionWorld.negate().normalize();
    const ndl = normalWorld.normalize().dot(sunDir);
    const nightFactor = smoothstep(0.1, -0.1, ndl); // 1 on the dark side
    m.emissiveNode = textureNode(tex.night).mul(nightFactor).mul(1.6);
  }
  return m;
}

/** PBR material for a non-Earth body. */
export function createBodyMaterial(data: PlanetData, tex: BodyTextures): MeshStandardNodeMaterial {
  if (data.bodyType === 'earth') return createEarthMaterial(tex);
  const m = new MeshStandardNodeMaterial();
  m.colorNode = textureNode(tex.map);
  m.metalnessNode = float(0);
  // Gas giants read as soft/diffuse; rocky bodies a touch rougher.
  m.roughnessNode = float(data.bodyType === 'gas' ? 0.8 : 0.95);
  return m;
}

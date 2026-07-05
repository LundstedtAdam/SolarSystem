import { MeshStandardNodeMaterial } from 'three/webgpu';
import type { Texture } from 'three';
import {
  texture as textureNode,
  normalMap,
  positionWorld,
  normalWorld,
  float,
  color,
  mix,
  smoothstep,
} from 'three/tsl';
import type { MoonData, PlanetData } from '../systems/bodies';
import { buildTerrain, buildEarthTerrain } from './terrain';

export interface BodyTextures {
  map?: Texture;
  night?: Texture;
  normal?: Texture;
  specular?: Texture;
}

/**
 * Earth: day map, real normal map, ocean-vs-land roughness from the specular
 * mask, and night-side city lights that fade across the terminator (computed
 * from the sun direction — the sun sits at the world origin).
 *
 * Terrain here is deliberately subtle and texture-led: land gets gentle
 * displacement and a relief normal blended toward the real normal map, the
 * ocean stays flat but its normal ripples over time so the water reads as
 * moving. Continents, coastlines and city lights stay recognizable.
 */
function createEarthMaterial(data: PlanetData, tex: BodyTextures): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial();
  if (tex.map) m.colorNode = textureNode(tex.map);
  m.metalnessNode = float(0);

  if (tex.specular) {
    const ocean = textureNode(tex.specular).r; // bright = water
    m.roughnessNode = mix(float(0.9), float(0.2), ocean); // land matte, seas glossy
    if (tex.normal) {
      const texN = normalMap(textureNode(tex.normal));
      const { position, normal } = buildEarthTerrain(data.size, ocean, texN);
      m.positionNode = position;
      m.normalNode = normal;
    }
  } else {
    m.roughnessNode = float(0.85);
    if (tex.normal) m.normalNode = normalMap(textureNode(tex.normal));
  }

  if (tex.night) {
    const sunDir = positionWorld.negate().normalize();
    const ndl = normalWorld.normalize().dot(sunDir);
    const nightFactor = smoothstep(0.1, -0.1, ndl); // 1 on the dark side
    m.emissiveNode = textureNode(tex.night).mul(nightFactor).mul(1.6);
  }
  return m;
}

/** PBR material for a non-Earth planet, with procedural terrain when present. */
export function createBodyMaterial(data: PlanetData, tex: BodyTextures): MeshStandardNodeMaterial {
  if (data.bodyType === 'earth') return createEarthMaterial(data, tex);
  const m = new MeshStandardNodeMaterial();
  m.metalnessNode = float(0);

  if (data.terrain) {
    const t = buildTerrain(data.terrain, data.size);
    m.positionNode = t.position;
    m.normalNode = t.normal;
    // Modulate the base map with micro-detail, or go fully procedural (Pluto).
    m.colorNode = tex.map ? textureNode(tex.map).mul(t.detail) : t.proceduralColor;
    m.roughnessNode = t.roughness;
    if (t.emissive) m.emissiveNode = t.emissive;
    return m;
  }

  if (tex.map) m.colorNode = textureNode(tex.map);
  // Gas giants read as soft/diffuse; rocky bodies a touch rougher.
  m.roughnessNode = float(data.bodyType === 'gas' ? 0.8 : 0.95);
  return m;
}

/** PBR material for a moon, with procedural terrain when present. */
export function createMoonMaterial(data: MoonData, tex?: Texture): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial();
  m.metalnessNode = float(0);

  if (data.terrain) {
    const t = buildTerrain(data.terrain, data.size);
    m.positionNode = t.position;
    m.normalNode = t.normal;
    m.colorNode = tex ? textureNode(tex).mul(t.detail) : t.proceduralColor;
    m.roughnessNode = t.roughness;
    if (t.emissive) m.emissiveNode = t.emissive;
    return m;
  }

  m.colorNode = tex ? textureNode(tex) : color(0x888888);
  m.roughnessNode = float(0.95);
  return m;
}

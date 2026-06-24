import { MeshStandardNodeMaterial } from 'three/webgpu';
import {
  positionLocal,
  float,
  vec3,
  mix,
  smoothstep,
  normalLocal,
  normalize,
  transformNormalToView,
  mx_fractal_noise_float,
  mx_worley_noise_float,
  uniform,
} from 'three/tsl';
import type { BiomeProfile } from './biomes';

/**
 * Procedural terrain material.
 *
 * Colour: `mx_fractal_noise_float` is a sum of Perlin octaves, so its output
 * clusters near 0 (std ~0.35x amplitude) and almost never reaches +/-amplitude.
 * Normalizing height by the full amplitude therefore parks every vertex around
 * the cLow<->cMid midpoint (which made Io olive instead of sulphur). We instead
 * normalize by the noise's REALISTIC spread so the body's `colorMid` is the
 * dominant colour, with `colorLow` only in genuine valleys and
 * `colorHigh`/`colorPolar` only on real peaks.
 *
 * Normals: vertex displacement does not update geometry normals, so the surface
 * would shade dead flat. We derive a per-pixel normal analytically from the
 * height-field gradient (finite differences) — resolution-independent detail
 * that keeps even the mobile mesh looking three-dimensional.
 */
export function createTerrainMaterial(
  biome: BiomeProfile,
  octaves = 4,
): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial();

  const oct = Math.max(2, Math.min(octaves, 5));
  const detailOct = Math.max(2, Math.min(oct, 4));

  // Height as a function of a point in the plane's local XY (displacement is +z).
  const heightAt = (P: typeof positionLocal) => {
    const continent = mx_fractal_noise_float(
      P.mul(biome.continentFreq),
      float(oct),
      float(biome.lacunarity),
      float(biome.diminish),
      float(biome.continentAmp),
    );
    const mountain = mx_fractal_noise_float(
      P.mul(biome.mountainFreq),
      float(Math.max(oct - 1, 2)),
      float(biome.lacunarity),
      float(biome.diminish),
      float(biome.mountainAmp),
    );
    const detail = mx_fractal_noise_float(
      P.mul(biome.detailFreq),
      float(detailOct),
      float(2.0),
      float(0.5),
      float(biome.detailAmp),
    );
    // High-frequency micro relief — reads as surface texture up close. Kept at
    // 2 octaves because the normal is evaluated per-pixel three times.
    const micro = mx_fractal_noise_float(
      P.mul(biome.detailFreq * 4.5),
      float(2),
      float(2.0),
      float(0.5),
      float(biome.detailAmp * 0.35),
    );

    let h = continent.add(mountain).add(detail).add(micro);

    if (biome.craterStrength > 0.05) {
      const craters = mx_worley_noise_float(P.mul(0.008), float(1.0));
      h = h.sub(craters.mul(biome.craterStrength * 20));
    }
    return h;
  };

  const P = positionLocal;
  const h = heightAt(P);

  m.positionNode = P.add(normalLocal.mul(h));

  // Per-pixel analytic normal from the height gradient. The displaced surface is
  // (x, y, h(x,y)) in local space, so the normal is normalize(-dh/dx, -dh/dy, 1),
  // transformed into view space for lighting.
  const eps = 0.6;
  const hX = heightAt(P.add(vec3(eps, 0, 0)));
  const hY = heightAt(P.add(vec3(0, eps, 0)));
  const dHdx = hX.sub(h).div(eps);
  const dHdy = hY.sub(h).div(eps);
  const nLocal = normalize(vec3(dHdx.negate(), dHdy.negate(), float(1.0)));
  m.normalNode = transformNormalToView(nLocal);

  // Colour: normalize height by the noise's realistic spread (not full amplitude)
  // so colorMid dominates, colorLow shows in valleys, colorHigh/Polar on peaks.
  const spread = Math.max(biome.continentAmp * 0.55 + biome.mountainAmp * 0.3, 3);
  const t = smoothstep(float(-spread), float(spread), h);

  const cLow = vec3(...biome.colorLow);
  const cMid = vec3(...biome.colorMid);
  const cHigh = vec3(...biome.colorHigh);
  const cPolar = vec3(...biome.colorPolar);

  const lowMid = mix(cLow, cMid, smoothstep(0.12, 0.5, t));
  const midHigh = mix(lowMid, cHigh, smoothstep(0.58, 0.9, t));
  const finalColor = mix(midHigh, cPolar, smoothstep(0.9, 1.0, t));

  m.colorNode = finalColor;
  m.metalnessNode = float(0);
  m.roughnessNode = mix(float(biome.roughnessLow), float(biome.roughnessHigh), t);

  if (biome.fogDensity > 0) {
    const fogU = uniform(biome.fogDensity);
    const fogCol = vec3(...biome.fogColor);
    const dist = positionLocal.length().mul(0.005);
    const fogFactor = smoothstep(0.0, 1.0, dist.mul(fogU));
    m.colorNode = mix(finalColor, fogCol, fogFactor);
  }

  return m;
}

// Procedural terrain for landable bodies, built as TSL node graphs for the
// WebGPU renderer. Three jobs, matching the three quality problems:
//
//   1. DISPLACEMENT + ANALYTIC NORMALS — a height field h(dir) over the unit
//      sphere displaces vertices along their normal, and the surface normal is
//      recomputed *analytically from the height function* (by sampling its
//      tangential gradient), not from screen-space derivatives. This is what
//      makes slopes, valleys and peaks respond correctly to the sun.
//
//   2. (geometry resolution lives in quality.ts → terrainSegments)
//
//   3. MICRO-DETAIL — a higher-frequency field adds per-fragment normal grain
//      plus albedo/roughness variation, styled per body `kind` (rocky, icy,
//      volcanic, sandy, earth) so no surface ever reads as a flat colour.
//
// Geometry is displaced from the *macro* field only (the mesh can't resolve
// fine detail); the *micro* field rides on top as a normal/colour bump. Both
// feed the same analytic-gradient normal, so macro relief and micro grain are
// lit consistently.

import {
  float,
  vec3,
  color,
  mix,
  smoothstep,
  clamp,
  pow,
  sin,
  dot,
  cross,
  normalize,
  positionLocal,
  normalLocal,
  transformNormalToView,
  timerLocal,
  mx_noise_float,
  mx_worley_noise_float,
} from 'three/tsl';
import type { TerrainProfile } from '../systems/bodies';

// A TSL node value. Kept loose because three/tsl is untyped here.
type N = ReturnType<typeof float>;

interface FbmOpts {
  octaves: number;
  lacunarity?: number;
  gain?: number;
  ridged?: boolean;
}

/**
 * Fractal Brownian motion of MaterialX perlin noise, evaluated at a 3D point.
 * Unrolled (octave count is a JS constant) so the whole thing is one static
 * node graph. Returns roughly [-1, 1]; ridged returns roughly [0, 1] with sharp
 * crests, used for mountainous/chaotic bodies.
 */
function fbm(p: N, { octaves, lacunarity = 2.0, gain = 0.5, ridged = false }: FbmOpts): N {
  let sum = float(0);
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = mx_noise_float(p.mul(freq));
    const oct = ridged ? float(1).sub(n.abs()).mul(float(1).sub(n.abs())) : n;
    sum = sum.add(oct.mul(amp));
    norm += amp;
    freq *= lacunarity;
    amp *= gain;
  }
  return sum.div(norm);
}

/**
 * An orthonormal tangent basis (t1, t2) for a unit direction. The reference
 * up-vector is swapped near the poles so the cross product never degenerates.
 */
function tangentBasis(dir: N): { t1: N; t2: N } {
  const up = dir.y.abs().lessThan(0.99).select(vec3(0, 1, 0), vec3(1, 0, 0));
  const t1 = normalize(cross(up, dir));
  const t2 = cross(dir, t1);
  return { t1, t2 };
}

/** Map the colour fields of a profile to TSL colour nodes (with sane defaults). */
function palette(profile: TerrainProfile) {
  return {
    low: color(profile.colorLow ?? 0x6b6b6b),
    high: color(profile.colorHigh ?? 0xb8b8b8),
    accent: color(profile.accent ?? profile.colorLow ?? 0x404040),
  };
}

export interface TerrainNodeSet {
  /** Object-space displaced vertex position (→ material.positionNode). */
  position: N;
  /** View-space analytic normal incl. micro grain (→ material.normalNode). */
  normal: N;
  /** Procedural albedo when the body has no base map (→ material.colorNode). */
  proceduralColor: N;
  /** Micro-detail multiplier (~0.8–1.2) to modulate an existing base map. */
  detail: N;
  /** Per-fragment roughness (→ material.roughnessNode). */
  roughness: N;
  /** Emissive hot-spots for volcanic bodies, else null. */
  emissive: N | null;
}

/**
 * Build the full set of terrain nodes for a body. `radius` is the render
 * radius (data.size); displacement amplitude in `profile.amp` is a fraction of
 * it. All profile constants are baked into the graph at call time.
 */
export function buildTerrain(profile: TerrainProfile, radius: number): TerrainNodeSet {
  const amp = profile.amp;
  const baseFreq = profile.freq;
  const octaves = profile.octaves;
  const ridged = profile.ridged ?? false;
  const microScale = profile.microScale ?? 16;
  const microStrength = profile.microStrength ?? 0.5;
  const { low, high, accent } = palette(profile);

  const dir = normalize(positionLocal);

  // --- macro height: drives geometry displacement -------------------------
  const macroH = (d: N): N => fbm(d.mul(baseFreq), { octaves, ridged });

  // --- micro height: rides on top as normal/colour grain, body-specific ----
  const microH = (d: N): N => {
    const grain = fbm(d.mul(baseFreq * microScale), { octaves: 3, gain: 0.55 });
    if (profile.kind === 'sandy') {
      // Directional dune ripples: a high-frequency sine across one axis,
      // warped by noise so the crests wander like real dune fields.
      const warp = mx_noise_float(d.mul(baseFreq * 3)).mul(0.6);
      const ripple = sin(dot(d, vec3(1, 0.35, 0)).mul(baseFreq * microScale * 1.4).add(warp));
      return grain.mul(0.4).add(ripple.mul(0.6));
    }
    if (profile.kind === 'volcanic') {
      // Sharp, ropey lava texture from ridged high-frequency noise.
      return fbm(d.mul(baseFreq * microScale), { octaves: 3, ridged: true }).mul(2).sub(1);
    }
    return grain;
  };

  // Combined height for the analytic normal (macro relief + micro grain).
  const height = (d: N): N => macroH(d).add(microH(d).mul(microStrength * 0.5));

  // --- displacement (vertex stage) ----------------------------------------
  const disp = macroH(dir).mul(radius * amp);
  const position = positionLocal.add(normalLocal.mul(disp));

  // --- analytic normal (fragment stage) -----------------------------------
  // Sample the height field at two small angular offsets along the tangent
  // basis; the tangential gradient gives the surface slope, and the perturbed
  // normal is dir minus that slope. eps is in direction-space; the radius
  // factor cancels because slope = Δheight·amp / (eps·radius) · radius.
  const eps = 0.0015;
  const { t1, t2 } = tangentBasis(dir);
  const h0 = height(dir);
  const hx = height(normalize(dir.add(t1.mul(eps))));
  const hy = height(normalize(dir.add(t2.mul(eps))));
  const sx = hx.sub(h0).mul(amp / eps);
  const sy = hy.sub(h0).mul(amp / eps);
  const objNormal = normalize(dir.sub(t1.mul(sx).add(t2.mul(sy))));
  const normal = transformNormalToView(objNormal);

  // --- colour, roughness, emissive (fragment stage) -----------------------
  // Height factor 0..1 used to blend low/high palette and tint slopes.
  const hf = clamp(macroH(dir).mul(0.5).add(0.5), 0, 1);
  const grain = mx_noise_float(dir.mul(baseFreq * microScale * 2)).mul(0.5).add(0.5);
  // Cellular field reused for cracks (rock/ice) and boulders (rock).
  const cell = mx_worley_noise_float(dir.mul(baseFreq * microScale * 0.5));

  let proceduralColor: N = mix(low, high, hf);
  let detail: N = float(1).sub(grain.mul(0.18)); // gentle base albedo variation
  let roughness: N = float(profile.roughness ?? 0.95);
  let emissive: N | null = null;

  if (profile.kind === 'rocky') {
    const cracks = smoothstep(0.0, 0.08, cell); // dark fissures along cell seams
    proceduralColor = proceduralColor.mul(mix(accent, vec3(1, 1, 1), cracks));
    detail = detail.mul(mix(float(0.85), float(1.1), grain));
    roughness = roughness.sub(grain.mul(0.1));
  } else if (profile.kind === 'icy') {
    // Crystalline facets + a bluish subsurface hint pooled in the lows.
    const facets = smoothstep(0.0, 0.12, cell);
    const subsurface = color(profile.accent ?? 0x9fd4ff);
    proceduralColor = mix(proceduralColor, subsurface, float(1).sub(hf).mul(0.35));
    detail = detail.mul(mix(float(0.92), float(1.12), facets));
    roughness = clamp(float(profile.roughness ?? 0.4).add(grain.mul(0.15)), 0, 1);
  } else if (profile.kind === 'volcanic') {
    // Ash deposits darken broad regions; hot rock glows faintly in the lows.
    const ash = smoothstep(0.45, 0.75, mx_noise_float(dir.mul(baseFreq * 2)).mul(0.5).add(0.5));
    proceduralColor = mix(proceduralColor, accent, ash);
    detail = detail.mul(mix(float(0.8), float(1.15), grain));
    roughness = roughness.sub(ash.mul(0.2));
    if (profile.emissive !== undefined) {
      const heat = pow(clamp(float(1).sub(hf), 0, 1), float(3)).mul(profile.emissiveStrength ?? 1.2);
      emissive = color(profile.emissive).mul(heat);
    }
  } else if (profile.kind === 'sandy') {
    // Dune micro-shading: ripple crests catch light, troughs hold shadow.
    const ripple = mx_noise_float(dir.mul(baseFreq * microScale)).mul(0.5).add(0.5);
    proceduralColor = mix(proceduralColor, accent, float(1).sub(hf).mul(0.25));
    detail = detail.mul(mix(float(0.88), float(1.1), ripple));
    roughness = clamp(roughness.add(ripple.mul(0.08)), 0, 1);
  }

  return { position, normal, proceduralColor, detail, roughness, emissive };
}

/**
 * Earth-specific extras: subtle, texture-led terrain that preserves the real
 * continents, normal map and city lights. Land gets gentle displacement and an
 * analytic relief normal (blended toward the texture normal); ocean stays flat
 * but its normal ripples over time so the water reads as moving.
 *
 * `oceanMask` is a node that is ~1 over water, ~0 over land (Earth's specular
 * map). `textureNormalView` is the real normal-map node (already view-space).
 */
export function buildEarthTerrain(
  radius: number,
  oceanMask: N,
  textureNormalView: N
): { position: N; normal: N } {
  const dir = normalize(positionLocal);
  const land = float(1).sub(oceanMask);

  // Gentle continental relief, masked to land only.
  const relief = (d: N): N => fbm(d.mul(3.2), { octaves: 5 });
  const amp = 0.012;
  const disp = relief(dir).mul(radius * amp).mul(land);
  const position = positionLocal.add(normalLocal.mul(disp));

  // Analytic land normal (mountain/rock grain), in view space.
  const eps = 0.0015;
  const { t1, t2 } = tangentBasis(dir);
  const grainH = (d: N): N => relief(d).add(fbm(d.mul(48), { octaves: 3 }).mul(0.25));
  const h0 = grainH(dir);
  const hx = grainH(normalize(dir.add(t1.mul(eps))));
  const hy = grainH(normalize(dir.add(t2.mul(eps))));
  const sx = hx.sub(h0).mul(amp / eps);
  const sy = hy.sub(h0).mul(amp / eps);
  const landNormal = transformNormalToView(normalize(dir.sub(t1.mul(sx).add(t2.mul(sy)))));

  // Animated water: small time-varying ripples perturb the ocean normal.
  const t = timerLocal(0.15);
  const wave = fbm(dir.mul(90).add(vec3(t, t.mul(0.7), 0)), { octaves: 2 }).mul(0.5);
  const waterNormal = transformNormalToView(
    normalize(dir.add(t1.mul(wave.mul(0.04))).add(t2.mul(wave.mul(0.04))))
  );

  // Texture-led: lean on the real normal map, add a touch of analytic relief on
  // land, swap to the moving-water normal over ocean.
  const landBlend = mix(textureNormalView, landNormal, float(0.35));
  const normal = normalize(mix(landBlend, waterNormal, oceanMask.mul(0.6)));

  return { position, normal };
}

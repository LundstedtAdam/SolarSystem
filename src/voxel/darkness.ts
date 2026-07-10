// Ambient-light darkness for the on-foot voxel world. Two multiplicative
// factors on top of each body's own authored ambientIntensity (biomes.ts):
// how deep underground the player is (cave), and whether the body's own
// archetype is already a naturally dark, airless/"moon" world (its authored
// ambientIntensity is already low — no new per-body data needed, that's
// exactly what the existing archetype variance already encodes). Both are
// gameplay-relevant: a flashlight matters in caves on any world, and on
// naturally dark worlds it matters even at the surface.

/** Ambient light multiplier at full cave depth (cave = 1) — dim, not pitch
 *  black, so the world still reads visually rather than vanishing. */
export const CAVE_FLOOR = 0.12;
/** Below this per-body ambientIntensity, the archetype itself is a "dark
 *  moon/planet" (airless, high-crater, no-fog biomes in biomes.ts already
 *  sit around 0.28-0.32) — dim even at the surface (cave = 0). */
export const DARK_BODY_AMBIENT_THRESHOLD = 0.35;
/** Extra multiplier applied on dark-body worlds, independent of cave depth. */
export const DARK_BODY_FLOOR = 0.45;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Combined ambient-light multiplier for a body with `baseAmbientIntensity`
 * (its biome archetype's authored value) at the current `cave` depth (0..1,
 * from `voxelTelemetry.cave`). Multiplicative, so a dark body's caves are the
 * darkest of all — never a special case, just both factors compounding.
 */
export function ambientDarknessFactor(baseAmbientIntensity: number, cave: number): number {
  const caveFactor = lerp(1, CAVE_FLOOR, Math.max(0, Math.min(1, cave)));
  const bodyFactor = baseAmbientIntensity < DARK_BODY_AMBIENT_THRESHOLD ? DARK_BODY_FLOOR : 1;
  return caveFactor * bodyFactor;
}

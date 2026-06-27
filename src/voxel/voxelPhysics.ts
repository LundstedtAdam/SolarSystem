// Per-body movement feel (variation layer 5). Gravity comes from real surface
// values where known, falling back to a radius proxy from bodies.ts; grip and
// speed come from the body's terrain kind so each archetype walks differently:
// icy Europa is slippery, deep Martian dust slows you, rock is firm.

import { PLANETS, type TerrainKind } from '../systems/bodies';

export interface SurfacePhysics {
  /** Surface gravity as a multiple of Earth's (1.0 = Earth). */
  gravity: number;
  /** Minecraft slipperiness 0..1: high = slidey (ice), low = grippy (rock).
   *  Per-tick velocity is conserved by `slip * 0.91`; acceleration scales by
   *  `(0.6 / slip)³`, so high-slip surfaces both glide and accelerate slowly. */
  slip: number;
  /** Walk/run top-speed multiplier (dust < rock < ice). */
  speedMul: number;
}

// Real NASA surface gravity (m/s²) per landable body.
const GRAVITY_MS2: Record<string, number> = {
  Merkurius: 3.7, Venus: 8.87, Jorden: 9.81, Mars: 3.71,
  'Månen': 1.62, Phobos: 0.006, Deimos: 0.003,
  Io: 1.8, Europa: 1.31, Ganymede: 1.43, Callisto: 1.24,
  Titan: 1.35, Miranda: 0.079, Triton: 0.78, Pluto: 0.62, Charon: 0.288,
};

const EARTH_G = 9.81;
// Floor on the Earth-relative multiplier so the smallest moons (Phobos, Deimos,
// Miranda, Charon) feel nearly weightless without launching the player out of
// the streamed area on every jump.
const MIN_GRAVITY = 0.04;

// Slipperiness + speed by terrain archetype (Minecraft slipperiness model:
// higher slip = more glide and slower acceleration).
const KIND_FEEL: Record<TerrainKind, { slip: number; speedMul: number }> = {
  rocky: { slip: 0.6, speedMul: 1.0 }, // rock/dirt baseline
  sandy: { slip: 0.7, speedMul: 0.8 }, // deep dust slows you
  icy: { slip: 0.98, speedMul: 1.05 }, // very slippery, slight glide
  volcanic: { slip: 0.55, speedMul: 0.95 }, // firm, rough basalt
  earth: { slip: 0.6, speedMul: 1.0 },
};

// Methane-ice bodies (Titan) read as a distinct, slicker-than-sand surface.
const METHANE_SLIP = 0.85;
const METHANE_BODIES = new Set(['Titan']);

function findKindAndRadius(name: string): { kind?: TerrainKind; radiusKm?: number } {
  for (const p of PLANETS) {
    if (p.name === name) return { kind: p.terrain?.kind, radiusKm: p.realRadiusKm };
    for (const m of p.moons) {
      if (m.name === name) return { kind: m.terrain?.kind, radiusKm: m.realRadiusKm };
    }
  }
  return {};
}

export function getSurfacePhysics(planet: string): SurfacePhysics {
  const { kind, radiusKm } = findKindAndRadius(planet);
  // Real gravity as a multiple of Earth's; G_EARTH in player.ts maps Earth=1.0
  // to the tuned in-game fall/jump feel.
  const ms2 = GRAVITY_MS2[planet];
  let gravity =
    ms2 != null
      ? ms2 / EARTH_G
      : radiusKm
        ? Math.min(Math.max(radiusKm / 6371, MIN_GRAVITY), 1.3) // proxy fallback
        : 0.5;
  gravity = Math.max(gravity, MIN_GRAVITY);
  const feel = KIND_FEEL[kind ?? 'rocky'];
  const slip = METHANE_BODIES.has(planet) ? METHANE_SLIP : feel.slip;
  return { gravity, slip, speedMul: feel.speedMul };
}

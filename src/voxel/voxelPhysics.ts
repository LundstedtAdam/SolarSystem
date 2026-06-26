// Per-body movement feel (variation layer 5). Gravity comes from real surface
// values where known, falling back to a radius proxy from bodies.ts; grip and
// speed come from the body's terrain kind so each archetype walks differently:
// icy Europa is slippery, deep Martian dust slows you, rock is firm.

import { PLANETS, type TerrainKind } from '../systems/bodies';

export interface SurfacePhysics {
  /** Surface gravity as a multiple of Earth's (1.0 = Earth). */
  gravity: number;
  /** Ground traction 0..1: low = slidey (ice), high = firm (rock). */
  grip: number;
  /** Walk/run top-speed multiplier (dust < rock < ice). */
  speedMul: number;
}

// Real surface gravity, Earth-relative, for the bodies that matter.
const GRAVITY: Record<string, number> = {
  Merkurius: 0.38, Venus: 0.9, Jorden: 1.0, Mars: 0.38,
  'Månen': 0.165, Phobos: 0.0006, Deimos: 0.0003,
  Io: 0.183, Europa: 0.134, Ganymede: 0.146, Callisto: 0.126,
  Titan: 0.138, Miranda: 0.008, Triton: 0.079, Pluto: 0.063, Charon: 0.029,
};

// Traction + speed by terrain archetype.
const KIND_FEEL: Record<TerrainKind, { grip: number; speedMul: number }> = {
  rocky: { grip: 1.0, speedMul: 1.0 },
  sandy: { grip: 0.9, speedMul: 0.8 }, // deep dust slows you
  icy: { grip: 0.2, speedMul: 1.05 }, // slippery, slight glide
  volcanic: { grip: 0.85, speedMul: 0.95 },
  earth: { grip: 1.0, speedMul: 1.0 },
};

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
  let gravity = GRAVITY[planet];
  if (gravity == null) {
    // Crude proxy: scale by radius vs Earth (assumes similar density).
    gravity = radiusKm ? Math.min(Math.max(radiusKm / 6371, 0.05), 1.3) : 0.5;
  }
  gravity = Math.max(gravity, 0.05);
  const feel = KIND_FEEL[kind ?? 'rocky'];
  return { gravity, grip: feel.grip, speedMul: feel.speedMul };
}

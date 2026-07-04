// Phase 11.3 — per-body power viability. No single generator works everywhere:
//   Solar   ∝ the biome's sun intensity, killed by thick haze (Venus, Titan)
//   Wind    — needs an atmosphere at all (vacuum moons get nothing)
//   Thermal — only on volcanic (lava-archetype) bodies
// This forces genuinely different base solutions per world, straight from the
// data that already styles each body (biomes + bodies tables).

import { getBiome } from '../terrain/biomes';
import { PLANETS } from '../systems/bodies';
import { archetypeFor } from './voxelBiomes';
import type { Structure } from '../store';

/** Power drawn by one running refinery. */
export const REFINERY_DRAW = 2;
/** Power drawn by one running extractor / condenser (Phase 11.6). Cheaper than
 *  a refinery — they're the base of the chain, meant to run before it does. */
export const EXTRACTOR_DRAW = 1;
export const CONDENSER_DRAW = 1;

/** Whether a body (planet or moon) has any atmosphere — wind needs one. */
export function hasAtmosphere(name: string): boolean {
  const planet = PLANETS.find((p) => p.name === name);
  if (planet) return !!planet.atmosphere;
  for (const p of PLANETS) {
    const m = p.moons.find((mm) => mm.name === name);
    if (m) return !!m.atmosphere;
  }
  return false;
}

/** Power output of one generator of the given kind on the given body. */
export function generatorOutput(kind: 'solar' | 'wind' | 'thermal', planet: string): number {
  const b = getBiome(planet);
  switch (kind) {
    case 'solar': {
      // Sunlight through the haze; Venus-style fog nearly kills it.
      const fog = (b as { fogDensity?: number }).fogDensity ?? 0;
      return Math.max(0, Math.round(b.sunIntensity * 2 * (1 - fog) * 10) / 10);
    }
    case 'wind':
      return hasAtmosphere(planet) ? 2 : 0;
    case 'thermal':
      return archetypeFor(planet) === 'lava' ? 3 : 0;
  }
}

export interface PowerBalance {
  generated: number;
  consumed: number;
  /** How many refineries the current generation can actually run. */
  poweredRefineries: number;
  /** How many extractors / condensers the remaining generation can run,
   *  allocated after refineries (extraction feeds refining, so refineries
   *  keep priority when power is short). */
  poweredExtractors: number;
  poweredCondensers: number;
}

/** Power balance for a body from its placed structures. Allocation is
 *  priority-ordered — refinery, then extractor, then condenser — each
 *  consuming from whatever generation is left after the previous kind. */
export function planetPower(structures: Structure[], planet: string): PowerBalance {
  let generated = 0;
  let refineries = 0;
  let extractors = 0;
  let condensers = 0;
  for (const s of structures) {
    if (s.planet !== planet) continue;
    if (s.type === 'solar' || s.type === 'wind' || s.type === 'thermal') {
      generated += generatorOutput(s.type, planet);
    } else if (s.type === 'refinery') {
      refineries++;
    } else if (s.type === 'extractor') {
      extractors++;
    } else if (s.type === 'condenser') {
      // Condensing needs vapour to pull from — a condenser on an airless
      // body never draws power or counts toward consumption, same as wind.
      if (hasAtmosphere(planet)) condensers++;
    }
  }
  const poweredRefineries = Math.min(refineries, Math.floor(generated / REFINERY_DRAW));
  let remaining = generated - poweredRefineries * REFINERY_DRAW;
  const poweredExtractors = Math.min(extractors, Math.floor(remaining / EXTRACTOR_DRAW));
  remaining -= poweredExtractors * EXTRACTOR_DRAW;
  const poweredCondensers = Math.min(condensers, Math.floor(remaining / CONDENSER_DRAW));
  const consumed =
    refineries * REFINERY_DRAW + extractors * EXTRACTOR_DRAW + condensers * CONDENSER_DRAW;
  return { generated, consumed, poweredRefineries, poweredExtractors, poweredCondensers };
}

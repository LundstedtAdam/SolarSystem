// Per-body atmospheric weather (variation layer 4). Same particle system, per
// body kind + colour, so motion masks any repetition in the ground: Mars red
// dust, Titan methane drizzle, Io ash, icy-body snow/crystals. Airless rocky
// bodies (Moon, Mercury) get nothing — vacuum reads as stillness.

import { getBiome } from '../terrain/biomes';
import { archetypeFor } from './voxelBiomes';

export interface WeatherProfile {
  kind: 'none' | 'dust' | 'ash' | 'drizzle' | 'snow';
  color: [number, number, number];
  /** Relative density 0..1 (scaled by the quality particle budget). */
  density: number;
  /** Fall speed (voxels/s); negative drifts upward (ash embers). */
  fall: number;
  /** Horizontal drift speed (voxels/s) — high = driving storm. */
  drift: number;
  size: number;
  /** Additive blending for glowing embers / crystals. */
  additive: boolean;
}

const NONE: WeatherProfile = {
  kind: 'none', color: [1, 1, 1], density: 0, fall: 0, drift: 0, size: 1, additive: false,
};

export function getWeather(planet: string): WeatherProfile {
  const b = getBiome(planet);
  switch (archetypeFor(planet)) {
    case 'rock': // Mars-style red dust storm
      return {
        kind: 'dust',
        color: [b.fogColor[0] || 0.8, b.fogColor[1] || 0.45, b.fogColor[2] || 0.3],
        density: 0.7, fall: 1.5, drift: 9, size: 1.3, additive: false,
      };
    case 'dune': // Titan methane drizzle
      return {
        kind: 'drizzle',
        color: [0.85, 0.6, 0.3], density: 0.85, fall: 16, drift: 2.5, size: 1.1, additive: false,
      };
    case 'lava': // Io / Venus ash + embers
      return {
        kind: 'ash',
        color: [0.9, 0.4, 0.18], density: 0.6, fall: -3, drift: 1.5, size: 1.4, additive: true,
      };
    case 'ice': // icy bodies — drifting crystals / silent snow
      return {
        kind: 'snow',
        color: [b.colorHigh[0], b.colorHigh[1], b.colorHigh[2]],
        density: 0.5, fall: 3.5, drift: 1.2, size: 1.2, additive: true,
      };
    case 'earth': // faint floating motes
      return {
        kind: 'dust',
        color: [0.9, 0.92, 0.95], density: 0.2, fall: 0.6, drift: 1.0, size: 0.8, additive: false,
      };
    default: // regolith / airless — nothing
      return NONE;
  }
}

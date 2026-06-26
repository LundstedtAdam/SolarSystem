// Per-body surface soundscape descriptors. Kept in the audio layer (not in
// biomes.ts) so the visual biome table stays focused on terrain/sky. Bodies not
// listed fall back to DEFAULT (near-silent airless world).

export interface SurfaceAudioProfile {
  /** Wind layer level 0..1 (filtered looping noise). 0 = airless silence. */
  wind: number;
  /** Wind low-pass cutoff in Hz. Low = dense/muffled, high = thin/whistly. */
  windCutoff: number;
  /** Sustained low rumble level 0..1. */
  rumble: number;
  /** Recurring environmental texture, scheduled by the surface audio driver. */
  texture: 'none' | 'ice' | 'volcanic' | 'geyser';
}

const SURFACE_AUDIO: Record<string, SurfaceAudioProfile> = {
  // Rocky planets
  Merkurius: { wind: 0, windCutoff: 400, rumble: 0, texture: 'none' },
  Venus: { wind: 0.65, windCutoff: 280, rumble: 0.5, texture: 'none' },
  Jorden: { wind: 0.4, windCutoff: 820, rumble: 0, texture: 'none' },
  Mars: { wind: 0.3, windCutoff: 1300, rumble: 0, texture: 'none' },
  // Moons
  'Månen': { wind: 0, windCutoff: 400, rumble: 0, texture: 'none' },
  Phobos: { wind: 0, windCutoff: 400, rumble: 0, texture: 'none' },
  Deimos: { wind: 0, windCutoff: 400, rumble: 0, texture: 'none' },
  Io: { wind: 0.12, windCutoff: 500, rumble: 0.6, texture: 'volcanic' },
  Europa: { wind: 0.06, windCutoff: 600, rumble: 0.12, texture: 'ice' },
  Ganymede: { wind: 0, windCutoff: 400, rumble: 0.06, texture: 'ice' },
  Callisto: { wind: 0, windCutoff: 400, rumble: 0.05, texture: 'none' },
  Titan: { wind: 0.55, windCutoff: 380, rumble: 0.4, texture: 'none' },
  Miranda: { wind: 0, windCutoff: 400, rumble: 0.05, texture: 'none' },
  Triton: { wind: 0.1, windCutoff: 700, rumble: 0.12, texture: 'geyser' },
  // Dwarf system
  Pluto: { wind: 0, windCutoff: 400, rumble: 0.04, texture: 'none' },
  Charon: { wind: 0, windCutoff: 400, rumble: 0, texture: 'ice' },
};

const DEFAULT: SurfaceAudioProfile = { wind: 0, windCutoff: 400, rumble: 0, texture: 'none' };

export function getSurfaceAudio(bodyName: string): SurfaceAudioProfile {
  return SURFACE_AUDIO[bodyName] ?? DEFAULT;
}

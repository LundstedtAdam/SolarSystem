// Quality presets and device auto-detection. Each preset scales geometry
// detail, particle/star/asteroid counts, pixel ratio, bloom and shadows so the
// app runs smoothly from phones up to high-end desktops.

export type Quality = 'low' | 'medium' | 'high' | 'ultra';

export interface QualitySettings {
  planetSegments: number;
  moonSegments: number;
  /**
   * Sphere segments for landable bodies (those with a terrain profile). Far
   * higher than planet/moonSegments so procedurally displaced relief reads as
   * smooth and continuous up close. Sphere triangles ≈ 2·N². See terrain.ts.
   */
  terrainSegments: number;
  atmosphereSegments: number;
  stars: number;
  solarWind: number;
  asteroids: number;
  dprMax: number;
  bloomStrength: number; // 0 disables the bloom pass
  shadows: boolean;
  shadowMapSize: number;
}

export const QUALITY: Record<Quality, QualitySettings> = {
  low: {
    planetSegments: 24,
    moonSegments: 16,
    terrainSegments: 96,
    atmosphereSegments: 24,
    stars: 600,
    solarWind: 300,
    asteroids: 0,
    dprMax: 1,
    bloomStrength: 0,
    shadows: false,
    shadowMapSize: 1024,
  },
  medium: {
    planetSegments: 40,
    moonSegments: 24,
    terrainSegments: 160,
    atmosphereSegments: 32,
    stars: 1500,
    solarWind: 800,
    asteroids: 2000,
    dprMax: 1.5,
    bloomStrength: 0.6,
    shadows: true,
    shadowMapSize: 1024,
  },
  high: {
    planetSegments: 64,
    moonSegments: 32,
    terrainSegments: 224,
    atmosphereSegments: 48,
    stars: 2500,
    solarWind: 1400,
    asteroids: 5000,
    dprMax: 2,
    bloomStrength: 0.7,
    shadows: true,
    shadowMapSize: 2048,
  },
  ultra: {
    planetSegments: 96,
    moonSegments: 48,
    terrainSegments: 320,
    atmosphereSegments: 64,
    stars: 4000,
    solarWind: 2200,
    asteroids: 9000,
    dprMax: 2,
    bloomStrength: 0.8,
    shadows: true,
    shadowMapSize: 4096,
  },
};

export const QUALITY_ORDER: Quality[] = ['low', 'medium', 'high', 'ultra'];

/** Best-effort quality guess from device capabilities (synchronous). */
export function detectQuality(): Quality {
  if (typeof navigator === 'undefined') return 'high';
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory || 4;
  const mobile = window.matchMedia?.('(pointer: coarse)').matches === true;
  const hasWebGPU = 'gpu' in navigator;

  if (mobile || cores <= 4 || mem <= 4) return hasWebGPU ? 'medium' : 'low';
  if (hasWebGPU && cores >= 8 && mem >= 8) return 'ultra';
  return 'high';
}

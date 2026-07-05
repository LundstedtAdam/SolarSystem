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
  bloomRadius: number;
  bloomThreshold: number;
  chromaticAberration: number;
  shadows: boolean;
  shadowMapSize: number;
  terrainResolution: number;
  terrainNoiseOctaves: number;
  /** Phase 9 voxel world: horizontal chunk radius loaded around the player. */
  voxelViewRadius: number;
  /** Number of mesher worker threads. */
  voxelWorkers: number;
  /** Max chunk (re)mesh requests dispatched per frame, to spread load. */
  voxelMeshBudget: number;
  /** Atmosphere/weather particle count in the voxel world. */
  voxelParticles: number;
  /** Max instanced surface-scatter props in the voxel world. */
  voxelScatter: number;
  /** Max instanced trees in the voxel world (World Richness Phase 7). */
  voxelTrees: number;
  /** Pooled engine-exhaust particle cap for the piloting ship trail. */
  shipTrailParticles: number;
  /** Max simultaneous asteroid-fracture debris/ore-chunk fragments. */
  debrisMax: number;
  /** Debris fragment lifetime (seconds) before it force-expires. */
  debrisLifetimeSec: number;
  /** Debris beyond this distance from the ship is force-culled each frame. */
  debrisCullDistance: number;
  /** Max simultaneous mining impact-chip spark particles (cosmetic only). */
  miningVfxBudget: number;
  /** Max concurrently "promoted" asteroids — pulled out of the shared
   *  InstancedMesh into a standalone, individually deformable mesh on first
   *  damage. Small regardless of total asteroid count: each is a real draw
   *  call plus potential per-vertex dent work. */
  promotedAsteroidMax: number;
  /** Whether a hard-enough debris bounce can chip off secondary fragments.
   *  Debris always bounces (cheap reflection math); this only gates the
   *  extra population growth from cascade chips on low-end tiers. */
  cascadeFractureEnabled: boolean;
}

export const QUALITY: Record<Quality, QualitySettings> = {
  low: {
    planetSegments: 24,
    moonSegments: 16,
    terrainSegments: 96,
    atmosphereSegments: 24,
    stars: 600,
    solarWind: 300,
    asteroids: 500,
    dprMax: 1,
    bloomStrength: 0,
    bloomRadius: 0.4,
    bloomThreshold: 0.0,
    chromaticAberration: 0,
    shadows: false,
    shadowMapSize: 1024,
    terrainResolution: 256,
    terrainNoiseOctaves: 3,
    voxelViewRadius: 2,
    voxelWorkers: 1,
    voxelMeshBudget: 2,
    voxelParticles: 180,
    voxelScatter: 120,
    voxelTrees: 60,
    shipTrailParticles: 0,
    debrisMax: 12,
    debrisLifetimeSec: 8,
    debrisCullDistance: 250,
    miningVfxBudget: 8,
    promotedAsteroidMax: 0,
    cascadeFractureEnabled: false,
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
    bloomStrength: 0.25,
    bloomRadius: 0.4,
    bloomThreshold: 0.85,
    chromaticAberration: 0.0012,
    shadows: true,
    shadowMapSize: 1024,
    terrainResolution: 512,
    terrainNoiseOctaves: 4,
    voxelViewRadius: 3,
    voxelWorkers: 2,
    voxelMeshBudget: 3,
    voxelParticles: 450,
    voxelScatter: 340,
    voxelTrees: 160,
    shipTrailParticles: 40,
    debrisMax: 24,
    debrisLifetimeSec: 12,
    debrisCullDistance: 400,
    miningVfxBudget: 16,
    promotedAsteroidMax: 8,
    cascadeFractureEnabled: true,
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
    bloomStrength: 0.3,
    bloomRadius: 0.45,
    bloomThreshold: 0.75,
    chromaticAberration: 0.0015,
    shadows: true,
    shadowMapSize: 2048,
    terrainResolution: 1024,
    terrainNoiseOctaves: 5,
    voxelViewRadius: 4,
    voxelWorkers: 3,
    voxelMeshBudget: 4,
    voxelParticles: 900,
    voxelScatter: 680,
    voxelTrees: 320,
    shipTrailParticles: 90,
    debrisMax: 64,
    debrisLifetimeSec: 18,
    debrisCullDistance: 700,
    miningVfxBudget: 32,
    promotedAsteroidMax: 16,
    cascadeFractureEnabled: true,
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
    bloomStrength: 0.35,
    bloomRadius: 0.5,
    bloomThreshold: 0.65,
    chromaticAberration: 0.002,
    shadows: true,
    shadowMapSize: 4096,
    terrainResolution: 1280,
    terrainNoiseOctaves: 5,
    voxelViewRadius: 5,
    voxelWorkers: 4,
    voxelMeshBudget: 6,
    voxelParticles: 1500,
    voxelScatter: 1100,
    voxelTrees: 550,
    shipTrailParticles: 160,
    debrisMax: 128,
    debrisLifetimeSec: 24,
    debrisCullDistance: 1000,
    miningVfxBudget: 48,
    promotedAsteroidMax: 32,
    cascadeFractureEnabled: true,
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

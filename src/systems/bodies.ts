// Body data table.
//
// RENDER values (`size`, `distance`) are an artistic compression — standard for
// solar-system visualizations — kept from the tuned legacy layout. The PHYSICS
// is real: J2000 orbital elements, orbital periods, eccentricities,
// inclinations, axial tilts, rotation periods (signed for retrograde), and
// physical radii. See systems/ephemeris.ts.

import type { OrbitalElements } from './ephemeris';

export const TEXTURES = {
  sun: '/texture/sun.jpg',
  mercury: '/texture/2k_mercury.jpg',
  venus: '/texture/venus.jpg',
  earth: '/texture/earth.jpg',
  moon: '/texture/earth_moon.jpg',
  mars: '/texture/mars.jpg',
  phobos: '/texture/phobos.jpg',
  deimos: '/texture/deimos.jpg',
  jupiter: '/texture/jupiter.jpg',
  io: '/texture/io.jpg',
  europa: '/texture/europa.jpg',
  ganymede: '/texture/Ganymede.jpg',
  callisto: '/texture/Callisto.jpg',
  saturn: '/texture/saturn.jpg',
  saturnRing: '/texture/saturn_ring.png',
  titan: '/texture/titan.jpg',
  uranus: '/texture/uranus.jpg',
  miranda: '/texture/miranda.jpg',
  neptune: '/texture/neptune.jpg',
  triton: '/texture/triton.jpg',
  stars: '/texture/stars.jpg',
  // Phase 2 additions (Solar System Scope, CC BY 4.0 — see CREDITS.md)
  milkyway: '/texture/milky_way.jpg',
  earthNight: '/texture/earth_nightmap.jpg',
  earthClouds: '/texture/earth_clouds.jpg',
  earthNormal: '/texture/earth_normal.png',
  earthSpecular: '/texture/earth_specular.png',
  venusAtmosphere: '/texture/venus_atmosphere.jpg',
} as const;

export type BodyType = 'earth' | 'gas' | 'rocky';

/** Physical character of a landable surface — drives micro-detail styling. */
export type TerrainKind = 'rocky' | 'icy' | 'volcanic' | 'sandy' | 'earth';

/**
 * Procedural terrain parameters for a landable body. Displacement amplitude and
 * frequency shape the macro relief; `kind` selects the micro-detail treatment
 * (grain, cracks, crystalline facets, lava, dunes). See scene/terrain.ts.
 */
export interface TerrainProfile {
  kind: TerrainKind;
  /** Displacement height as a fraction of the body's render radius. */
  amp: number;
  /** Base spatial frequency of the macro relief. */
  freq: number;
  /** Macro FBM octave count. */
  octaves: number;
  /** Sharp ridged crests (mountainous / chaotic terrain). */
  ridged?: boolean;
  /** Frequency multiplier for the micro-detail layer (default 16). */
  microScale?: number;
  /** Strength of the micro-detail normal grain (default 0.5). */
  microStrength?: number;
  /** Base roughness (default 0.95; icy bodies lower). */
  roughness?: number;
  /** Procedural palette (used as albedo when there is no base map). */
  colorLow?: number;
  colorHigh?: number;
  /** Cracks/ash/subsurface tint. */
  accent?: number;
  /** Volcanic hot-spot emissive colour. */
  emissive?: number;
  emissiveStrength?: number;
}

export interface Atmosphere {
  color: number;
  intensity: number;
  /** Shell radius as a multiple of body radius. */
  scale: number;
}

export interface MoonData {
  name: string;
  /** Base diffuse map; omitted for procedurally-coloured bodies (e.g. Charon). */
  texture?: string;
  size: number; // render radius
  distance: number; // render orbital distance
  realRadiusKm: number;
  /** Sidereal orbital period in days; negative = retrograde (e.g. Triton). */
  orbitalPeriodDays: number;
  atmosphere?: Atmosphere;
  /** Procedural terrain (displacement + analytic normals + micro-detail). */
  terrain?: TerrainProfile;
  /** Randomized starting phase (no public epoch elements for moons here). */
  initialAngle: number;
}

export interface PlanetData {
  name: string;
  /** Base diffuse map; omitted for procedurally-coloured bodies (e.g. Pluto). */
  texture?: string;
  size: number; // render radius
  distance: number; // render semi-major axis (cinematic compression)
  color: number;
  bodyType: BodyType;
  realRadiusKm: number;
  elements: OrbitalElements;
  axialTiltDeg: number;
  /** Sidereal rotation period in days; negative = retrograde (Venus, Uranus). */
  rotationPeriodDays: number;
  moons: MoonData[];
  /** Procedural terrain (displacement + analytic normals + micro-detail). */
  terrain?: TerrainProfile;
  hasRing?: boolean;
  ringTexture?: string;
  atmosphere?: Atmosphere;
  nightTexture?: string;
  cloudsTexture?: string;
  normalTexture?: string;
  specularTexture?: string;
}

const moon = (
  name: string,
  texture: string | undefined,
  size: number,
  distance: number,
  realRadiusKm: number,
  orbitalPeriodDays: number,
  terrain?: TerrainProfile,
  atmosphere?: Atmosphere
): MoonData => ({
  name,
  texture,
  size,
  distance,
  realRadiusKm,
  orbitalPeriodDays,
  terrain,
  atmosphere,
  initialAngle: Math.random() * Math.PI * 2,
});

export const PLANETS: PlanetData[] = [
  {
    name: 'Merkurius',
    texture: TEXTURES.mercury,
    size: 3.8,
    distance: 60,
    color: 0x888888,
    bodyType: 'rocky',
    realRadiusKm: 2439.7,
    axialTiltDeg: 0.034,
    rotationPeriodDays: 58.646,
    terrain: { kind: 'rocky', amp: 0.05, freq: 2.6, octaves: 5, microScale: 14, microStrength: 0.6, roughness: 0.95, colorLow: 0x5a5450, colorHigh: 0xa39c93, accent: 0x36322f },
    elements: { aAU: 0.38709927, e: 0.20563593, iDeg: 7.00497902, omegaDeg: 48.33076593, wDeg: 29.12703035, m0Deg: 174.7925272 },
    moons: [],
  },
  {
    name: 'Venus',
    texture: TEXTURES.venusAtmosphere,
    size: 9.5,
    distance: 90,
    color: 0xe8e1d1,
    bodyType: 'rocky',
    realRadiusKm: 6051.8,
    axialTiltDeg: 177.36,
    rotationPeriodDays: -243.025, // retrograde
    atmosphere: { color: 0xe8c16a, intensity: 0.9, scale: 1.07 },
    terrain: { kind: 'volcanic', amp: 0.025, freq: 2.2, octaves: 5, microScale: 12, microStrength: 0.45, roughness: 0.92, colorLow: 0x8c6a3a, colorHigh: 0xd9bd86, accent: 0x4f3d24 },
    elements: { aAU: 0.72333566, e: 0.00677672, iDeg: 3.39467605, omegaDeg: 76.67984255, wDeg: 54.92262463, m0Deg: 50.37663232 },
    moons: [],
  },
  {
    name: 'Jorden',
    texture: TEXTURES.earth,
    size: 10,
    distance: 130,
    color: 0x3a5fcd,
    bodyType: 'earth',
    realRadiusKm: 6371.0,
    axialTiltDeg: 23.44,
    rotationPeriodDays: 0.99726968,
    nightTexture: TEXTURES.earthNight,
    cloudsTexture: TEXTURES.earthClouds,
    normalTexture: TEXTURES.earthNormal,
    specularTexture: TEXTURES.earthSpecular,
    atmosphere: { color: 0x5b9bd5, intensity: 1.0, scale: 1.04 },
    terrain: { kind: 'earth', amp: 0.012, freq: 3.2, octaves: 5 },
    elements: { aAU: 1.00000261, e: 0.01671123, iDeg: 0.0, omegaDeg: 0.0, wDeg: 102.93768193, m0Deg: -2.47311027 },
    moons: [
      moon('Månen', TEXTURES.moon, 2.7, 20, 1737.4, 27.321661, {
        kind: 'rocky', amp: 0.045, freq: 2.8, octaves: 5, microScale: 16, microStrength: 0.6, roughness: 0.97, colorLow: 0x4f4d4a, colorHigh: 0xa8a39c, accent: 0x2c2a28,
      }),
    ],
  },
  {
    name: 'Mars',
    texture: TEXTURES.mars,
    size: 5.3,
    distance: 170,
    color: 0x993d07,
    bodyType: 'rocky',
    realRadiusKm: 3389.5,
    axialTiltDeg: 25.19,
    rotationPeriodDays: 1.02595676,
    atmosphere: { color: 0xc1684a, intensity: 0.28, scale: 1.05 },
    terrain: { kind: 'sandy', amp: 0.04, freq: 2.4, octaves: 6, microScale: 18, microStrength: 0.5, roughness: 0.95, colorLow: 0x6e3b22, colorHigh: 0xc06a3c, accent: 0x3d1f12 },
    elements: { aAU: 1.52371034, e: 0.0933941, iDeg: 1.84969142, omegaDeg: 49.55953891, wDeg: -73.5031685, m0Deg: 19.39019754 },
    moons: [
      moon('Phobos', TEXTURES.phobos, 1.1, 9, 11.27, 0.31891, {
        kind: 'rocky', amp: 0.09, freq: 2.2, octaves: 5, microScale: 14, microStrength: 0.7, roughness: 0.98, colorLow: 0x423b34, colorHigh: 0x8a7f72, accent: 0x231f1b,
      }),
      moon('Deimos', TEXTURES.deimos, 0.6, 15, 6.2, 1.26244, {
        kind: 'rocky', amp: 0.05, freq: 2.6, octaves: 4, microScale: 16, microStrength: 0.5, roughness: 0.97, colorLow: 0x4a4239, colorHigh: 0x968a7b, accent: 0x282320,
      }),
    ],
  },
  {
    name: 'Jupiter',
    texture: TEXTURES.jupiter,
    size: 28,
    distance: 230,
    color: 0xb07f35,
    bodyType: 'gas',
    realRadiusKm: 69911,
    axialTiltDeg: 3.13,
    rotationPeriodDays: 0.41354,
    atmosphere: { color: 0xc8a77b, intensity: 0.45, scale: 1.03 },
    elements: { aAU: 5.202887, e: 0.04838624, iDeg: 1.30439695, omegaDeg: 100.47390909, wDeg: -85.74542926, m0Deg: 19.66796068 },
    moons: [
      moon('Io', TEXTURES.io, 3.6, 42, 1821.6, 1.769138, {
        kind: 'volcanic', amp: 0.03, freq: 2.6, octaves: 5, microScale: 13, microStrength: 0.55, roughness: 0.85, colorLow: 0x9c7d2c, colorHigh: 0xeed98a, accent: 0x4a2a10, emissive: 0xff5a1e, emissiveStrength: 0.9,
      }),
      moon('Europa', TEXTURES.europa, 3.1, 67, 1560.8, 3.551181, {
        kind: 'icy', amp: 0.012, freq: 2.8, octaves: 4, microScale: 20, microStrength: 0.35, roughness: 0.35, colorLow: 0xb9a890, colorHigh: 0xf0ece4, accent: 0x9fd0ff,
      }),
      moon('Ganymede', TEXTURES.ganymede, 5.2, 107, 2634.1, 7.154553, {
        kind: 'icy', amp: 0.03, freq: 3.0, octaves: 5, microScale: 16, microStrength: 0.5, roughness: 0.5, colorLow: 0x6f655b, colorHigh: 0xb7ad9f, accent: 0x9ec4e0,
      }),
      moon('Callisto', TEXTURES.callisto, 4.8, 188, 2410.3, 16.689018, {
        kind: 'icy', amp: 0.04, freq: 2.7, octaves: 5, microScale: 15, microStrength: 0.6, roughness: 0.6, colorLow: 0x4a423a, colorHigh: 0x988b79, accent: 0x6f8aa0,
      }),
    ],
  },
  {
    name: 'Saturnus',
    texture: TEXTURES.saturn,
    size: 24,
    distance: 300,
    color: 0xf4e395,
    bodyType: 'gas',
    realRadiusKm: 58232,
    axialTiltDeg: 26.73,
    rotationPeriodDays: 0.44401,
    hasRing: true,
    ringTexture: TEXTURES.saturnRing,
    atmosphere: { color: 0xd9c8a0, intensity: 0.4, scale: 1.03 },
    elements: { aAU: 9.53667594, e: 0.05386179, iDeg: 2.48599187, omegaDeg: 113.66242448, wDeg: -21.06354617, m0Deg: -42.64463408 },
    moons: [
      moon(
        'Titan',
        TEXTURES.titan,
        5.8,
        122,
        2574.7,
        15.945,
        { kind: 'sandy', amp: 0.02, freq: 2.3, octaves: 5, microScale: 18, microStrength: 0.4, roughness: 0.9, colorLow: 0x7a4e1f, colorHigh: 0xd49a4a, accent: 0x432a10 },
        { color: 0xe0883a, intensity: 0.8, scale: 1.12 }
      ),
    ],
  },
  {
    name: 'Uranus',
    texture: TEXTURES.uranus,
    size: 10,
    distance: 350,
    color: 0x87ceeb,
    bodyType: 'gas',
    realRadiusKm: 25362,
    axialTiltDeg: 97.77,
    rotationPeriodDays: -0.71833, // retrograde
    atmosphere: { color: 0x9fe3e8, intensity: 0.55, scale: 1.05 },
    elements: { aAU: 19.18916464, e: 0.04725744, iDeg: 0.77263783, omegaDeg: 74.01692503, wDeg: 96.93735127, m0Deg: 142.28382821 },
    moons: [
      moon('Miranda', TEXTURES.miranda, 2.4, 50, 235.8, 1.413479, {
        kind: 'rocky', amp: 0.11, freq: 2.0, octaves: 6, ridged: true, microScale: 14, microStrength: 0.7, roughness: 0.85, colorLow: 0x57514b, colorHigh: 0xb6aea4, accent: 0x8fb0c4,
      }),
    ],
  },
  {
    name: 'Neptunus',
    texture: TEXTURES.neptune,
    size: 9.5,
    distance: 400,
    color: 0x4169e1,
    bodyType: 'gas',
    realRadiusKm: 24622,
    axialTiltDeg: 28.32,
    rotationPeriodDays: 0.6713,
    atmosphere: { color: 0x4f76e8, intensity: 0.65, scale: 1.06 },
    elements: { aAU: 30.06992276, e: 0.00859048, iDeg: 1.77004347, omegaDeg: 131.78422574, wDeg: -86.81946347, m0Deg: -100.08479196 },
    moons: [
      moon('Triton', TEXTURES.triton, 4.2, 35, 1353.4, -5.876854, {
        kind: 'icy', amp: 0.025, freq: 3.2, octaves: 5, microScale: 17, microStrength: 0.45, roughness: 0.4, colorLow: 0xc9b6a6, colorHigh: 0xf2e8de, accent: 0xe0a6c0,
      }),
    ], // retrograde
  },
  {
    // Dwarf planet. No real surface map shipped — rendered procedurally from
    // its terrain palette (nitrogen-ice plains, reddish tholin highlands).
    name: 'Pluto',
    size: 4.4,
    distance: 460,
    color: 0xc9a884,
    bodyType: 'rocky',
    realRadiusKm: 1188.3,
    axialTiltDeg: 122.53,
    rotationPeriodDays: -6.387230, // retrograde
    terrain: { kind: 'icy', amp: 0.05, freq: 2.6, octaves: 6, ridged: true, microScale: 15, microStrength: 0.55, roughness: 0.6, colorLow: 0x8a6a4f, colorHigh: 0xe8dcc8, accent: 0xd9b08a },
    elements: { aAU: 39.48211675, e: 0.2488273, iDeg: 17.14001206, omegaDeg: 110.30393684, wDeg: 224.06891629, m0Deg: 238.92903833 },
    moons: [
      moon('Charon', undefined, 2.1, 12, 606.0, 6.387230, {
        kind: 'icy', amp: 0.045, freq: 2.8, octaves: 5, microScale: 16, microStrength: 0.55, roughness: 0.65, colorLow: 0x5a534d, colorHigh: 0xada69d, accent: 0x8a5a3a,
      }),
    ],
  },
];

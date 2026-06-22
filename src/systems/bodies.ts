// Body data table. Values are the original art values from the legacy build,
// preserved for visual parity. Phase 3 will replace these with real orbital
// elements + physical data.

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

/** Surface/material class, drives how the body's material is built. */
export type BodyType = 'earth' | 'gas' | 'rocky';

/** Fresnel atmosphere shell config. */
export interface Atmosphere {
  color: number;
  intensity: number;
  /** Shell radius as a multiple of body radius. */
  scale: number;
}

export interface MoonData {
  name: string;
  texture: string;
  size: number;
  distance: number;
  speed: number;
  atmosphere?: Atmosphere;
  /** Randomized starting angle, set once at module load (matches legacy behavior). */
  initialAngle: number;
}

export interface PlanetData {
  name: string;
  texture: string;
  size: number;
  distance: number;
  speed: number;
  color: number;
  moons: MoonData[];
  hasRing?: boolean;
  ringTexture?: string;
  bodyType?: BodyType;
  atmosphere?: Atmosphere;
  /** Earth-only extra maps. */
  nightTexture?: string;
  cloudsTexture?: string;
  normalTexture?: string;
  specularTexture?: string;
  /** Orbit shape, randomized once at module load (matches legacy behavior). */
  eccentricity: number;
  inclination: number;
  initialAngle: number;
}

const moon = (
  name: string,
  texture: string,
  size: number,
  distance: number,
  speed: number,
  atmosphere?: Atmosphere
): MoonData => ({
  name,
  texture,
  size,
  distance,
  speed,
  atmosphere,
  initialAngle: Math.random() * Math.PI * 2,
});

// The legacy build randomized eccentricity/inclination/start-angle per body at
// runtime. We generate them once here so the orbit line and the planet motion
// share identical values, just as before.
const planet = (
  data: Omit<PlanetData, 'eccentricity' | 'inclination' | 'initialAngle'>
): PlanetData => ({
  ...data,
  eccentricity: 0.1 * Math.random(),
  inclination: Math.random() * 0.1,
  initialAngle: Math.random() * Math.PI * 2,
});

export const PLANETS: PlanetData[] = [
  planet({
    name: 'Merkurius',
    texture: TEXTURES.mercury,
    size: 3.8,
    distance: 60,
    speed: 1.6,
    color: 0x888888,
    bodyType: 'rocky',
    moons: [],
  }),
  planet({
    name: 'Venus',
    // The dense cloud deck is what we actually see from space.
    texture: TEXTURES.venusAtmosphere,
    size: 9.5,
    distance: 90,
    speed: 1.2,
    color: 0xe8e1d1,
    bodyType: 'rocky',
    atmosphere: { color: 0xe8c16a, intensity: 0.9, scale: 1.07 },
    moons: [],
  }),
  planet({
    name: 'Jorden',
    texture: TEXTURES.earth,
    size: 10,
    distance: 130,
    speed: 1.0,
    color: 0x3a5fcd,
    bodyType: 'earth',
    nightTexture: TEXTURES.earthNight,
    cloudsTexture: TEXTURES.earthClouds,
    normalTexture: TEXTURES.earthNormal,
    specularTexture: TEXTURES.earthSpecular,
    atmosphere: { color: 0x5b9bd5, intensity: 1.0, scale: 1.04 },
    moons: [moon('Månen', TEXTURES.moon, 2.7, 20, 0.8)],
  }),
  planet({
    name: 'Mars',
    texture: TEXTURES.mars,
    size: 5.3,
    distance: 170,
    speed: 0.8,
    color: 0x993d07,
    bodyType: 'rocky',
    atmosphere: { color: 0xc1684a, intensity: 0.28, scale: 1.05 },
    moons: [
      moon('Phobos', TEXTURES.phobos, 1.1, 9, 1.4),
      moon('Deimos', TEXTURES.deimos, 0.6, 15, 1.2),
    ],
  }),
  planet({
    name: 'Jupiter',
    texture: TEXTURES.jupiter,
    size: 28,
    distance: 230,
    speed: 0.4,
    color: 0xb07f35,
    bodyType: 'gas',
    atmosphere: { color: 0xc8a77b, intensity: 0.45, scale: 1.03 },
    moons: [
      moon('Io', TEXTURES.io, 3.6, 42, 1.8),
      moon('Europa', TEXTURES.europa, 3.1, 67, 1.5),
      moon('Ganymede', TEXTURES.ganymede, 5.2, 107, 1.1),
      moon('Callisto', TEXTURES.callisto, 4.8, 188, 0.9),
    ],
  }),
  planet({
    name: 'Saturnus',
    texture: TEXTURES.saturn,
    size: 24,
    distance: 300,
    speed: 0.3,
    color: 0xf4e395,
    bodyType: 'gas',
    hasRing: true,
    ringTexture: TEXTURES.saturnRing,
    atmosphere: { color: 0xd9c8a0, intensity: 0.4, scale: 1.03 },
    moons: [
      moon('Titan', TEXTURES.titan, 5.8, 122, 1.0, {
        color: 0xe0883a,
        intensity: 0.8,
        scale: 1.12,
      }),
    ],
  }),
  planet({
    name: 'Uranus',
    texture: TEXTURES.uranus,
    size: 10,
    distance: 350,
    speed: 0.2,
    color: 0x87ceeb,
    bodyType: 'gas',
    atmosphere: { color: 0x9fe3e8, intensity: 0.55, scale: 1.05 },
    moons: [moon('Miranda', TEXTURES.miranda, 2.4, 50, 1.3)],
  }),
  planet({
    name: 'Neptunus',
    texture: TEXTURES.neptune,
    size: 9.5,
    distance: 400,
    speed: 0.15,
    color: 0x4169e1,
    bodyType: 'gas',
    atmosphere: { color: 0x4f76e8, intensity: 0.65, scale: 1.06 },
    moons: [moon('Triton', TEXTURES.triton, 4.2, 35, 1.1)],
  }),
];

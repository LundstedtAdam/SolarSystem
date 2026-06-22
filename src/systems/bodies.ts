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
} as const;

export interface MoonData {
  name: string;
  texture: string;
  size: number;
  distance: number;
  speed: number;
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
  speed: number
): MoonData => ({
  name,
  texture,
  size,
  distance,
  speed,
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
    moons: [],
  }),
  planet({
    name: 'Venus',
    texture: TEXTURES.venus,
    size: 9.5,
    distance: 90,
    speed: 1.2,
    color: 0xe8e1d1,
    moons: [],
  }),
  planet({
    name: 'Jorden',
    texture: TEXTURES.earth,
    size: 10,
    distance: 130,
    speed: 1.0,
    color: 0x3a5fcd,
    moons: [moon('Månen', TEXTURES.moon, 2.7, 20, 0.8)],
  }),
  planet({
    name: 'Mars',
    texture: TEXTURES.mars,
    size: 5.3,
    distance: 170,
    speed: 0.8,
    color: 0x993d07,
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
    hasRing: true,
    ringTexture: TEXTURES.saturnRing,
    moons: [moon('Titan', TEXTURES.titan, 5.8, 122, 1.0)],
  }),
  planet({
    name: 'Uranus',
    texture: TEXTURES.uranus,
    size: 10,
    distance: 350,
    speed: 0.2,
    color: 0x87ceeb,
    moons: [moon('Miranda', TEXTURES.miranda, 2.4, 50, 1.3)],
  }),
  planet({
    name: 'Neptunus',
    texture: TEXTURES.neptune,
    size: 9.5,
    distance: 400,
    speed: 0.15,
    color: 0x4169e1,
    moons: [moon('Triton', TEXTURES.triton, 4.2, 35, 1.1)],
  }),
];

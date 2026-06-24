export interface BiomeProfile {
  continentFreq: number;
  continentAmp: number;
  mountainFreq: number;
  mountainAmp: number;
  detailFreq: number;
  detailAmp: number;
  octaves: number;
  lacunarity: number;
  diminish: number;
  craterStrength: number;
  colorLow: [number, number, number];
  colorMid: [number, number, number];
  colorHigh: [number, number, number];
  colorPolar: [number, number, number];
  roughnessLow: number;
  roughnessHigh: number;
  skyZenith: [number, number, number];
  skyHorizon: [number, number, number];
  skyHasSun: boolean;
  fogDensity: number;
  fogColor: [number, number, number];
  /** Ambient (shadow-fill) light colour — matches the body's atmosphere. */
  ambientColor: [number, number, number];
  /** Ambient intensity: high for hazy worlds (Venus/Titan), low for airless rock. */
  ambientIntensity: number;
  /** Key (sun) light intensity: high+low-ambient = harsh contrast (Moon/Io). */
  sunIntensity: number;
}

const BIOMES: Record<string, BiomeProfile> = {
  // Mercury: stark grey, heavily cratered, airless — extreme light/shadow contrast
  Merkurius: {
    continentFreq: 0.003, continentAmp: 25,
    mountainFreq: 0.015, mountainAmp: 8,
    detailFreq: 0.06, detailAmp: 1.5,
    octaves: 3, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.9,
    colorLow: [0.18, 0.18, 0.18], colorMid: [0.45, 0.44, 0.43],
    colorHigh: [0.72, 0.70, 0.68], colorPolar: [0.55, 0.54, 0.53],
    roughnessLow: 0.9, roughnessHigh: 0.95,
    skyZenith: [0, 0, 0], skyHorizon: [0, 0, 0],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
    ambientColor: [0.60, 0.60, 0.62], ambientIntensity: 0.28, sunIntensity: 1.6,
  },
  // Venus: orange-brown volcanic plains; dense haze makes it almost shadowless
  Venus: {
    continentFreq: 0.002, continentAmp: 15,
    mountainFreq: 0.012, mountainAmp: 18,
    detailFreq: 0.04, detailAmp: 1.0,
    octaves: 3, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.05,
    colorLow: [0.45, 0.27, 0.10], colorMid: [0.66, 0.44, 0.16],
    colorHigh: [0.80, 0.58, 0.24], colorPolar: [0.70, 0.50, 0.20],
    roughnessLow: 0.7, roughnessHigh: 0.85,
    skyZenith: [0.90, 0.72, 0.36], skyHorizon: [0.85, 0.55, 0.18],
    skyHasSun: false, fogDensity: 0.65, fogColor: [0.85, 0.62, 0.26],
    ambientColor: [1.0, 0.75, 0.35], ambientIntensity: 1.1, sunIntensity: 0.4,
  },
  // Earth: blue water (low), green/brown land (mid), white peaks
  Jorden: {
    continentFreq: 0.002, continentAmp: 30,
    mountainFreq: 0.01, mountainAmp: 15,
    detailFreq: 0.05, detailAmp: 2.0,
    octaves: 4, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0,
    colorLow: [0.06, 0.22, 0.52], colorMid: [0.22, 0.50, 0.16],
    colorHigh: [0.52, 0.40, 0.26], colorPolar: [0.94, 0.95, 0.97],
    roughnessLow: 0.3, roughnessHigh: 0.9,
    skyZenith: [0.40, 0.65, 0.92], skyHorizon: [0.70, 0.85, 0.95],
    skyHasSun: true, fogDensity: 0.08, fogColor: [0.7, 0.8, 0.9],
    ambientColor: [0.70, 0.80, 0.95], ambientIntensity: 0.6, sunIntensity: 1.2,
  },
  // Mars: rust-red iron oxide, canyon variation, thin dusty pink-orange sky
  Mars: {
    continentFreq: 0.002, continentAmp: 35,
    mountainFreq: 0.008, mountainAmp: 20,
    detailFreq: 0.04, detailAmp: 2.5,
    octaves: 4, lacunarity: 2.2, diminish: 0.45,
    craterStrength: 0.3,
    colorLow: [0.42, 0.16, 0.06], colorMid: [0.66, 0.30, 0.12],
    colorHigh: [0.80, 0.46, 0.22], colorPolar: [0.85, 0.78, 0.68],
    roughnessLow: 0.8, roughnessHigh: 0.95,
    skyZenith: [0.72, 0.42, 0.32], skyHorizon: [0.82, 0.56, 0.44],
    skyHasSun: true, fogDensity: 0.15, fogColor: [0.78, 0.48, 0.32],
    ambientColor: [1.0, 0.55, 0.35], ambientIntensity: 0.55, sunIntensity: 1.1,
  },
  // Moon: medium grey regolith, cratered, pure black airless sky
  'Månen': {
    continentFreq: 0.004, continentAmp: 15,
    mountainFreq: 0.02, mountainAmp: 6,
    detailFreq: 0.08, detailAmp: 1.0,
    octaves: 3, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.8,
    colorLow: [0.22, 0.22, 0.23], colorMid: [0.44, 0.44, 0.45],
    colorHigh: [0.62, 0.62, 0.63], colorPolar: [0.50, 0.50, 0.51],
    roughnessLow: 0.85, roughnessHigh: 0.95,
    skyZenith: [0, 0, 0], skyHorizon: [0, 0, 0],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
    ambientColor: [0.62, 0.62, 0.66], ambientIntensity: 0.32, sunIntensity: 1.45,
  },
  // Phobos: very dark grey-brown rock, Stickney-like depression, black sky
  Phobos: {
    continentFreq: 0.008, continentAmp: 8,
    mountainFreq: 0.03, mountainAmp: 3,
    detailFreq: 0.1, detailAmp: 0.5,
    octaves: 2, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.7,
    colorLow: [0.14, 0.13, 0.12], colorMid: [0.27, 0.25, 0.23],
    colorHigh: [0.38, 0.36, 0.32], colorPolar: [0.30, 0.28, 0.25],
    roughnessLow: 0.9, roughnessHigh: 0.95,
    skyZenith: [0, 0, 0], skyHorizon: [0, 0, 0],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
    ambientColor: [0.55, 0.52, 0.50], ambientIntensity: 0.3, sunIntensity: 1.2,
  },
  // Deimos: very dark grey-brown, smooth regolith, black sky
  Deimos: {
    continentFreq: 0.006, continentAmp: 3,
    mountainFreq: 0.025, mountainAmp: 1.0,
    detailFreq: 0.08, detailAmp: 0.2,
    octaves: 2, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.15,
    colorLow: [0.16, 0.15, 0.14], colorMid: [0.29, 0.27, 0.25],
    colorHigh: [0.38, 0.36, 0.33], colorPolar: [0.32, 0.30, 0.28],
    roughnessLow: 0.9, roughnessHigh: 0.95,
    skyZenith: [0, 0, 0], skyHorizon: [0, 0, 0],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
    ambientColor: [0.55, 0.52, 0.50], ambientIntensity: 0.3, sunIntensity: 1.2,
  },
  // Io: bright sulphur yellow/orange, black lava at lowest elevations, harsh light
  Io: {
    continentFreq: 0.003, continentAmp: 8,
    mountainFreq: 0.015, mountainAmp: 4,
    detailFreq: 0.05, detailAmp: 1.5,
    octaves: 3, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.15,
    colorLow: [0.08, 0.06, 0.03], colorMid: [0.85, 0.72, 0.16],
    colorHigh: [0.92, 0.56, 0.08], colorPolar: [0.88, 0.80, 0.32],
    roughnessLow: 0.6, roughnessHigh: 0.85,
    skyZenith: [0.02, 0.01, 0.0], skyHorizon: [0.10, 0.07, 0.02],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
    ambientColor: [1.0, 0.92, 0.55], ambientIntensity: 0.45, sunIntensity: 1.35,
  },
  // Europa: blue-white cracked ice, reddish-brown lineae in low cracks
  Europa: {
    continentFreq: 0.002, continentAmp: 3,
    mountainFreq: 0.025, mountainAmp: 2,
    detailFreq: 0.08, detailAmp: 0.5,
    octaves: 3, lacunarity: 2.5, diminish: 0.4,
    craterStrength: 0.08,
    colorLow: [0.42, 0.28, 0.18], colorMid: [0.74, 0.80, 0.90],
    colorHigh: [0.90, 0.93, 0.97], colorPolar: [0.94, 0.96, 0.99],
    roughnessLow: 0.15, roughnessHigh: 0.35,
    skyZenith: [0.01, 0.02, 0.05], skyHorizon: [0.03, 0.05, 0.10],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
    ambientColor: [0.55, 0.65, 0.85], ambientIntensity: 0.5, sunIntensity: 1.1,
  },
  // Ganymede: grey-brown grooved ice, cratered, dark sky
  Ganymede: {
    continentFreq: 0.003, continentAmp: 12,
    mountainFreq: 0.018, mountainAmp: 5,
    detailFreq: 0.06, detailAmp: 1.2,
    octaves: 3, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.55,
    colorLow: [0.28, 0.25, 0.21], colorMid: [0.47, 0.44, 0.39],
    colorHigh: [0.60, 0.58, 0.54], colorPolar: [0.55, 0.57, 0.60],
    roughnessLow: 0.5, roughnessHigh: 0.85,
    skyZenith: [0, 0, 0], skyHorizon: [0.01, 0.01, 0.02],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
    ambientColor: [0.60, 0.60, 0.60], ambientIntensity: 0.45, sunIntensity: 1.1,
  },
  // Callisto: very dark grey, extremely densely cratered, dark sky
  Callisto: {
    continentFreq: 0.004, continentAmp: 8,
    mountainFreq: 0.02, mountainAmp: 3,
    detailFreq: 0.07, detailAmp: 0.6,
    octaves: 3, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.95,
    colorLow: [0.13, 0.11, 0.10], colorMid: [0.26, 0.24, 0.21],
    colorHigh: [0.36, 0.33, 0.30], colorPolar: [0.28, 0.26, 0.24],
    roughnessLow: 0.8, roughnessHigh: 0.95,
    skyZenith: [0, 0, 0], skyHorizon: [0, 0, 0],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
    ambientColor: [0.55, 0.55, 0.55], ambientIntensity: 0.4, sunIntensity: 1.0,
  },
  // Titan: deep orange-brown dunes, thick orange haze sky, warm shadowless fill
  Titan: {
    continentFreq: 0.002, continentAmp: 10,
    mountainFreq: 0.01, mountainAmp: 4,
    detailFreq: 0.04, detailAmp: 1.2,
    octaves: 3, lacunarity: 2.3, diminish: 0.45,
    craterStrength: 0.05,
    colorLow: [0.14, 0.09, 0.03], colorMid: [0.54, 0.34, 0.11],
    colorHigh: [0.70, 0.48, 0.20], colorPolar: [0.48, 0.32, 0.10],
    roughnessLow: 0.5, roughnessHigh: 0.75,
    skyZenith: [0.78, 0.50, 0.22], skyHorizon: [0.85, 0.58, 0.20],
    skyHasSun: false, fogDensity: 0.55, fogColor: [0.80, 0.54, 0.20],
    ambientColor: [1.0, 0.60, 0.25], ambientIntensity: 0.95, sunIntensity: 0.45,
  },
  // Miranda: grey ice, dramatic elevation variation / chevron cliffs, dark sky
  Miranda: {
    continentFreq: 0.005, continentAmp: 30,
    mountainFreq: 0.02, mountainAmp: 20,
    detailFreq: 0.08, detailAmp: 3.5,
    octaves: 3, lacunarity: 2.2, diminish: 0.5,
    craterStrength: 0.25,
    colorLow: [0.30, 0.30, 0.32], colorMid: [0.50, 0.50, 0.52],
    colorHigh: [0.64, 0.64, 0.66], colorPolar: [0.58, 0.58, 0.60],
    roughnessLow: 0.6, roughnessHigh: 0.9,
    skyZenith: [0, 0, 0], skyHorizon: [0.01, 0.01, 0.02],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
    ambientColor: [0.58, 0.62, 0.72], ambientIntensity: 0.45, sunIntensity: 1.0,
  },
  // Triton: pale pink-grey nitrogen ice, dark geyser streaks low, near-black sky
  Triton: {
    continentFreq: 0.003, continentAmp: 12,
    mountainFreq: 0.02, mountainAmp: 6,
    detailFreq: 0.07, detailAmp: 1.8,
    octaves: 3, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.45,
    colorLow: [0.16, 0.13, 0.13], colorMid: [0.74, 0.64, 0.62],
    colorHigh: [0.84, 0.74, 0.72], colorPolar: [0.80, 0.70, 0.68],
    roughnessLow: 0.25, roughnessHigh: 0.55,
    skyZenith: [0.02, 0.02, 0.04], skyHorizon: [0.02, 0.02, 0.03],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
    ambientColor: [0.50, 0.58, 0.80], ambientIntensity: 0.45, sunIntensity: 0.9,
  },
  // Pluto: pale pink/grey nitrogen plains, light grey ice peaks, very dark sky
  Pluto: {
    continentFreq: 0.002, continentAmp: 8,
    mountainFreq: 0.015, mountainAmp: 14,
    detailFreq: 0.06, detailAmp: 1.2,
    octaves: 3, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.12,
    colorLow: [0.58, 0.50, 0.47], colorMid: [0.80, 0.71, 0.67],
    colorHigh: [0.90, 0.85, 0.82], colorPolar: [0.92, 0.88, 0.85],
    roughnessLow: 0.25, roughnessHigh: 0.45,
    skyZenith: [0.02, 0.02, 0.03], skyHorizon: [0.02, 0.02, 0.03],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
    ambientColor: [0.60, 0.62, 0.78], ambientIntensity: 0.45, sunIntensity: 0.8,
  },
  // Charon: grey ice, darker low areas, very dark sky
  Charon: {
    continentFreq: 0.003, continentAmp: 12,
    mountainFreq: 0.012, mountainAmp: 18,
    detailFreq: 0.05, detailAmp: 1.0,
    octaves: 3, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.25,
    colorLow: [0.24, 0.24, 0.26], colorMid: [0.47, 0.47, 0.50],
    colorHigh: [0.58, 0.58, 0.61], colorPolar: [0.30, 0.28, 0.30],
    roughnessLow: 0.5, roughnessHigh: 0.8,
    skyZenith: [0.02, 0.02, 0.03], skyHorizon: [0.02, 0.02, 0.03],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
    ambientColor: [0.55, 0.58, 0.72], ambientIntensity: 0.42, sunIntensity: 0.8,
  },
};

const DEFAULT_BIOME: BiomeProfile = {
  continentFreq: 0.003, continentAmp: 15,
  mountainFreq: 0.015, mountainAmp: 8,
  detailFreq: 0.06, detailAmp: 1.5,
  octaves: 3, lacunarity: 2.0, diminish: 0.5,
  craterStrength: 0.3,
  colorLow: [0.38, 0.36, 0.33], colorMid: [0.55, 0.52, 0.48],
  colorHigh: [0.68, 0.65, 0.61], colorPolar: [0.55, 0.55, 0.55],
  roughnessLow: 0.8, roughnessHigh: 0.9,
  skyZenith: [0, 0, 0], skyHorizon: [0, 0, 0],
  skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
  ambientColor: [0.6, 0.6, 0.6], ambientIntensity: 0.4, sunIntensity: 1.1,
};

export function getBiome(bodyName: string): BiomeProfile {
  return BIOMES[bodyName] ?? DEFAULT_BIOME;
}

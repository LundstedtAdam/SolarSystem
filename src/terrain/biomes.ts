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
}

const BIOMES: Record<string, BiomeProfile> = {
  // Mercury: high-contrast grey, heavily cratered, no atmosphere
  Merkurius: {
    continentFreq: 0.003, continentAmp: 25,
    mountainFreq: 0.015, mountainAmp: 8,
    detailFreq: 0.06, detailAmp: 1.5,
    octaves: 3, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.9,
    colorLow: [0.22, 0.21, 0.20], colorMid: [0.42, 0.41, 0.40],
    colorHigh: [0.68, 0.66, 0.64], colorPolar: [0.50, 0.49, 0.48],
    roughnessLow: 0.9, roughnessHigh: 0.95,
    skyZenith: [0, 0, 0], skyHorizon: [0, 0, 0],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
  },
  // Venus: orange-brown volcanic plains, dense cloud haze
  Venus: {
    continentFreq: 0.002, continentAmp: 15,
    mountainFreq: 0.012, mountainAmp: 18,
    detailFreq: 0.04, detailAmp: 1.0,
    octaves: 3, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.05,
    colorLow: [0.50, 0.30, 0.10], colorMid: [0.62, 0.40, 0.15],
    colorHigh: [0.75, 0.50, 0.20], colorPolar: [0.58, 0.38, 0.14],
    roughnessLow: 0.7, roughnessHigh: 0.85,
    skyZenith: [0.88, 0.70, 0.35], skyHorizon: [0.82, 0.52, 0.18],
    skyHasSun: false, fogDensity: 0.65, fogColor: [0.82, 0.60, 0.25],
  },
  // Earth: green vegetation, brown rock, blue water, white poles
  Jorden: {
    continentFreq: 0.002, continentAmp: 30,
    mountainFreq: 0.01, mountainAmp: 15,
    detailFreq: 0.05, detailAmp: 2.0,
    octaves: 4, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0,
    colorLow: [0.08, 0.25, 0.50], colorMid: [0.20, 0.48, 0.15],
    colorHigh: [0.50, 0.38, 0.25], colorPolar: [0.92, 0.94, 0.96],
    roughnessLow: 0.3, roughnessHigh: 0.9,
    skyZenith: [0.40, 0.65, 0.92], skyHorizon: [0.70, 0.85, 0.95],
    skyHasSun: true, fogDensity: 0.08, fogColor: [0.7, 0.8, 0.9],
  },
  // Mars: rust-red iron oxide, canyon systems, dust
  Mars: {
    continentFreq: 0.002, continentAmp: 35,
    mountainFreq: 0.008, mountainAmp: 20,
    detailFreq: 0.04, detailAmp: 2.5,
    octaves: 4, lacunarity: 2.2, diminish: 0.45,
    craterStrength: 0.3,
    colorLow: [0.45, 0.18, 0.06], colorMid: [0.62, 0.28, 0.10],
    colorHigh: [0.72, 0.42, 0.18], colorPolar: [0.80, 0.72, 0.62],
    roughnessLow: 0.8, roughnessHigh: 0.95,
    skyZenith: [0.68, 0.38, 0.28], skyHorizon: [0.75, 0.50, 0.40],
    skyHasSun: true, fogDensity: 0.15, fogColor: [0.70, 0.42, 0.28],
  },
  // Moon: grey regolith, heavily cratered, no atmosphere
  'Månen': {
    continentFreq: 0.004, continentAmp: 15,
    mountainFreq: 0.02, mountainAmp: 6,
    detailFreq: 0.08, detailAmp: 1.0,
    octaves: 3, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.8,
    colorLow: [0.25, 0.25, 0.25], colorMid: [0.40, 0.40, 0.40],
    colorHigh: [0.52, 0.52, 0.52], colorPolar: [0.35, 0.35, 0.35],
    roughnessLow: 0.85, roughnessHigh: 0.95,
    skyZenith: [0, 0, 0], skyHorizon: [0, 0, 0],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
  },
  // Phobos: dark grey, Stickney-like crater, grooves
  Phobos: {
    continentFreq: 0.008, continentAmp: 8,
    mountainFreq: 0.03, mountainAmp: 3,
    detailFreq: 0.1, detailAmp: 0.5,
    octaves: 2, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.7,
    colorLow: [0.18, 0.17, 0.16], colorMid: [0.28, 0.27, 0.25],
    colorHigh: [0.35, 0.33, 0.30], colorPolar: [0.22, 0.21, 0.20],
    roughnessLow: 0.9, roughnessHigh: 0.95,
    skyZenith: [0, 0, 0], skyHorizon: [0, 0, 0],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
  },
  // Deimos: dark grey, smooth regolith, minimal features
  Deimos: {
    continentFreq: 0.006, continentAmp: 3,
    mountainFreq: 0.025, mountainAmp: 1.0,
    detailFreq: 0.08, detailAmp: 0.2,
    octaves: 2, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.15,
    colorLow: [0.20, 0.19, 0.18], colorMid: [0.30, 0.28, 0.26],
    colorHigh: [0.36, 0.34, 0.32], colorPolar: [0.25, 0.24, 0.22],
    roughnessLow: 0.9, roughnessHigh: 0.95,
    skyZenith: [0, 0, 0], skyHorizon: [0, 0, 0],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
  },
  // Io: sulphur yellow and orange, black lava fields, volcanic vents
  Io: {
    continentFreq: 0.003, continentAmp: 8,
    mountainFreq: 0.015, mountainAmp: 4,
    detailFreq: 0.05, detailAmp: 1.5,
    octaves: 3, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.15,
    colorLow: [0.12, 0.10, 0.05], colorMid: [0.82, 0.70, 0.15],
    colorHigh: [0.90, 0.55, 0.08], colorPolar: [0.85, 0.78, 0.30],
    roughnessLow: 0.6, roughnessHigh: 0.85,
    skyZenith: [0, 0, 0], skyHorizon: [0.05, 0.04, 0.01],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
  },
  // Europa: cracked blue-white ice, reddish-brown lineae
  Europa: {
    continentFreq: 0.002, continentAmp: 3,
    mountainFreq: 0.025, mountainAmp: 2,
    detailFreq: 0.08, detailAmp: 0.5,
    octaves: 3, lacunarity: 2.5, diminish: 0.4,
    craterStrength: 0.08,
    colorLow: [0.45, 0.30, 0.20], colorMid: [0.72, 0.78, 0.88],
    colorHigh: [0.88, 0.92, 0.96], colorPolar: [0.92, 0.95, 0.98],
    roughnessLow: 0.15, roughnessHigh: 0.35,
    skyZenith: [0, 0, 0], skyHorizon: [0.02, 0.03, 0.06],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
  },
  // Ganymede: grey-brown grooved ice, cratered
  Ganymede: {
    continentFreq: 0.003, continentAmp: 12,
    mountainFreq: 0.018, mountainAmp: 5,
    detailFreq: 0.06, detailAmp: 1.2,
    octaves: 3, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.55,
    colorLow: [0.30, 0.27, 0.22], colorMid: [0.45, 0.42, 0.38],
    colorHigh: [0.58, 0.56, 0.52], colorPolar: [0.50, 0.52, 0.55],
    roughnessLow: 0.5, roughnessHigh: 0.85,
    skyZenith: [0, 0, 0], skyHorizon: [0, 0, 0],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
  },
  // Callisto: dark grey, extremely dense craters
  Callisto: {
    continentFreq: 0.004, continentAmp: 8,
    mountainFreq: 0.02, mountainAmp: 3,
    detailFreq: 0.07, detailAmp: 0.6,
    octaves: 3, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.95,
    colorLow: [0.15, 0.13, 0.11], colorMid: [0.25, 0.23, 0.20],
    colorHigh: [0.33, 0.30, 0.27], colorPolar: [0.20, 0.18, 0.16],
    roughnessLow: 0.8, roughnessHigh: 0.95,
    skyZenith: [0, 0, 0], skyHorizon: [0, 0, 0],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
  },
  // Titan: orange-brown dunes, methane lakes, thick haze
  Titan: {
    continentFreq: 0.002, continentAmp: 10,
    mountainFreq: 0.01, mountainAmp: 4,
    detailFreq: 0.04, detailAmp: 1.2,
    octaves: 3, lacunarity: 2.3, diminish: 0.45,
    craterStrength: 0.05,
    colorLow: [0.12, 0.08, 0.03], colorMid: [0.50, 0.32, 0.10],
    colorHigh: [0.65, 0.45, 0.18], colorPolar: [0.42, 0.28, 0.08],
    roughnessLow: 0.5, roughnessHigh: 0.75,
    skyZenith: [0.75, 0.48, 0.22], skyHorizon: [0.82, 0.55, 0.18],
    skyHasSun: false, fogDensity: 0.55, fogColor: [0.78, 0.52, 0.18],
  },
  // Miranda: grey ice with dramatic cliffs, extreme elevation variation
  Miranda: {
    continentFreq: 0.005, continentAmp: 30,
    mountainFreq: 0.02, mountainAmp: 20,
    detailFreq: 0.08, detailAmp: 3.5,
    octaves: 3, lacunarity: 2.2, diminish: 0.5,
    craterStrength: 0.25,
    colorLow: [0.32, 0.32, 0.34], colorMid: [0.48, 0.48, 0.50],
    colorHigh: [0.62, 0.62, 0.64], colorPolar: [0.55, 0.55, 0.57],
    roughnessLow: 0.6, roughnessHigh: 0.9,
    skyZenith: [0, 0, 0], skyHorizon: [0, 0, 0],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
  },
  // Triton: pale pink nitrogen ice, dark geyser streaks, cantaloupe terrain
  Triton: {
    continentFreq: 0.003, continentAmp: 12,
    mountainFreq: 0.02, mountainAmp: 6,
    detailFreq: 0.07, detailAmp: 1.8,
    octaves: 3, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.45,
    colorLow: [0.18, 0.15, 0.14], colorMid: [0.72, 0.62, 0.60],
    colorHigh: [0.82, 0.72, 0.70], colorPolar: [0.78, 0.68, 0.66],
    roughnessLow: 0.25, roughnessHigh: 0.55,
    skyZenith: [0.02, 0.02, 0.04], skyHorizon: [0.01, 0.01, 0.02],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
  },
  // Pluto: pale pink-grey nitrogen plains, ice mountains at edges
  Pluto: {
    continentFreq: 0.002, continentAmp: 8,
    mountainFreq: 0.015, mountainAmp: 14,
    detailFreq: 0.06, detailAmp: 1.2,
    octaves: 3, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.12,
    colorLow: [0.72, 0.62, 0.58], colorMid: [0.82, 0.72, 0.68],
    colorHigh: [0.88, 0.80, 0.76], colorPolar: [0.90, 0.85, 0.82],
    roughnessLow: 0.25, roughnessHigh: 0.45,
    skyZenith: [0.03, 0.03, 0.04], skyHorizon: [0.02, 0.02, 0.03],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
  },
  // Charon: grey ice, large canyon system, dark polar region
  Charon: {
    continentFreq: 0.003, continentAmp: 12,
    mountainFreq: 0.012, mountainAmp: 18,
    detailFreq: 0.05, detailAmp: 1.0,
    octaves: 3, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.25,
    colorLow: [0.32, 0.32, 0.34], colorMid: [0.45, 0.45, 0.48],
    colorHigh: [0.55, 0.55, 0.58], colorPolar: [0.15, 0.12, 0.12],
    roughnessLow: 0.5, roughnessHigh: 0.8,
    skyZenith: [0.03, 0.03, 0.04], skyHorizon: [0.02, 0.02, 0.03],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
  },
};

const DEFAULT_BIOME: BiomeProfile = {
  continentFreq: 0.003, continentAmp: 15,
  mountainFreq: 0.015, mountainAmp: 8,
  detailFreq: 0.06, detailAmp: 1.5,
  octaves: 3, lacunarity: 2.0, diminish: 0.5,
  craterStrength: 0.3,
  colorLow: [0.40, 0.38, 0.35], colorMid: [0.55, 0.52, 0.48],
  colorHigh: [0.65, 0.62, 0.58], colorPolar: [0.50, 0.50, 0.50],
  roughnessLow: 0.8, roughnessHigh: 0.9,
  skyZenith: [0, 0, 0], skyHorizon: [0, 0, 0],
  skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
};

export function getBiome(bodyName: string): BiomeProfile {
  return BIOMES[bodyName] ?? DEFAULT_BIOME;
}

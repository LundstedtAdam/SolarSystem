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
  Merkurius: {
    continentFreq: 0.003, continentAmp: 25,
    mountainFreq: 0.015, mountainAmp: 8,
    detailFreq: 0.06, detailAmp: 1.5,
    octaves: 3, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.8,
    colorLow: [0.35, 0.33, 0.30], colorMid: [0.50, 0.48, 0.45],
    colorHigh: [0.65, 0.63, 0.60], colorPolar: [0.55, 0.53, 0.50],
    roughnessLow: 0.9, roughnessHigh: 0.95,
    skyZenith: [0, 0, 0], skyHorizon: [0, 0, 0],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
  },
  Venus: {
    continentFreq: 0.002, continentAmp: 15,
    mountainFreq: 0.012, mountainAmp: 18,
    detailFreq: 0.04, detailAmp: 1.0,
    octaves: 3, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.05,
    colorLow: [0.55, 0.35, 0.15], colorMid: [0.65, 0.45, 0.20],
    colorHigh: [0.80, 0.55, 0.25], colorPolar: [0.60, 0.40, 0.18],
    roughnessLow: 0.7, roughnessHigh: 0.85,
    skyZenith: [0.91, 0.76, 0.42], skyHorizon: [0.85, 0.55, 0.20],
    skyHasSun: false, fogDensity: 0.6, fogColor: [0.85, 0.65, 0.30],
  },
  Jorden: {
    continentFreq: 0.002, continentAmp: 30,
    mountainFreq: 0.01, mountainAmp: 15,
    detailFreq: 0.05, detailAmp: 2.0,
    octaves: 4, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0,
    colorLow: [0.15, 0.35, 0.55], colorMid: [0.25, 0.50, 0.20],
    colorHigh: [0.55, 0.45, 0.30], colorPolar: [0.85, 0.88, 0.92],
    roughnessLow: 0.3, roughnessHigh: 0.9,
    skyZenith: [0.53, 0.81, 0.92], skyHorizon: [0.75, 0.88, 0.95],
    skyHasSun: true, fogDensity: 0.08, fogColor: [0.7, 0.8, 0.9],
  },
  Mars: {
    continentFreq: 0.002, continentAmp: 35,
    mountainFreq: 0.008, mountainAmp: 20,
    detailFreq: 0.04, detailAmp: 2.5,
    octaves: 4, lacunarity: 2.2, diminish: 0.45,
    craterStrength: 0.3,
    colorLow: [0.55, 0.22, 0.08], colorMid: [0.70, 0.35, 0.15],
    colorHigh: [0.80, 0.50, 0.25], colorPolar: [0.85, 0.75, 0.65],
    roughnessLow: 0.8, roughnessHigh: 0.95,
    skyZenith: [0.76, 0.41, 0.29], skyHorizon: [0.80, 0.55, 0.45],
    skyHasSun: true, fogDensity: 0.12, fogColor: [0.75, 0.45, 0.30],
  },
  'Månen': {
    continentFreq: 0.004, continentAmp: 15,
    mountainFreq: 0.02, mountainAmp: 6,
    detailFreq: 0.08, detailAmp: 1.0,
    octaves: 3, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.7,
    colorLow: [0.30, 0.30, 0.30], colorMid: [0.45, 0.44, 0.43],
    colorHigh: [0.55, 0.54, 0.53], colorPolar: [0.40, 0.40, 0.40],
    roughnessLow: 0.85, roughnessHigh: 0.95,
    skyZenith: [0, 0, 0], skyHorizon: [0, 0, 0],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
  },
  Phobos: {
    continentFreq: 0.008, continentAmp: 8,
    mountainFreq: 0.03, mountainAmp: 3,
    detailFreq: 0.1, detailAmp: 0.5,
    octaves: 2, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.6,
    colorLow: [0.25, 0.22, 0.20], colorMid: [0.35, 0.32, 0.28],
    colorHigh: [0.40, 0.38, 0.35], colorPolar: [0.30, 0.28, 0.25],
    roughnessLow: 0.9, roughnessHigh: 0.95,
    skyZenith: [0, 0, 0], skyHorizon: [0, 0, 0],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
  },
  Deimos: {
    continentFreq: 0.006, continentAmp: 4,
    mountainFreq: 0.025, mountainAmp: 1.5,
    detailFreq: 0.08, detailAmp: 0.3,
    octaves: 2, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.2,
    colorLow: [0.28, 0.25, 0.22], colorMid: [0.35, 0.32, 0.30],
    colorHigh: [0.40, 0.38, 0.36], colorPolar: [0.32, 0.30, 0.28],
    roughnessLow: 0.9, roughnessHigh: 0.95,
    skyZenith: [0, 0, 0], skyHorizon: [0, 0, 0],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
  },
  Io: {
    continentFreq: 0.003, continentAmp: 10,
    mountainFreq: 0.015, mountainAmp: 5,
    detailFreq: 0.05, detailAmp: 1.5,
    octaves: 3, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.15,
    colorLow: [0.75, 0.65, 0.15], colorMid: [0.85, 0.55, 0.10],
    colorHigh: [0.90, 0.40, 0.10], colorPolar: [0.80, 0.70, 0.30],
    roughnessLow: 0.6, roughnessHigh: 0.85,
    skyZenith: [0, 0, 0], skyHorizon: [0.05, 0.04, 0.01],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
  },
  Europa: {
    continentFreq: 0.002, continentAmp: 5,
    mountainFreq: 0.025, mountainAmp: 3,
    detailFreq: 0.08, detailAmp: 0.8,
    octaves: 3, lacunarity: 2.5, diminish: 0.4,
    craterStrength: 0.1,
    colorLow: [0.60, 0.70, 0.80], colorMid: [0.75, 0.82, 0.90],
    colorHigh: [0.85, 0.90, 0.95], colorPolar: [0.90, 0.93, 0.97],
    roughnessLow: 0.2, roughnessHigh: 0.4,
    skyZenith: [0, 0, 0], skyHorizon: [0.02, 0.03, 0.06],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
  },
  Ganymede: {
    continentFreq: 0.003, continentAmp: 12,
    mountainFreq: 0.018, mountainAmp: 5,
    detailFreq: 0.06, detailAmp: 1.2,
    octaves: 3, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.6,
    colorLow: [0.35, 0.30, 0.25], colorMid: [0.50, 0.48, 0.45],
    colorHigh: [0.60, 0.58, 0.55], colorPolar: [0.55, 0.58, 0.60],
    roughnessLow: 0.5, roughnessHigh: 0.85,
    skyZenith: [0, 0, 0], skyHorizon: [0, 0, 0],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
  },
  Callisto: {
    continentFreq: 0.004, continentAmp: 10,
    mountainFreq: 0.02, mountainAmp: 4,
    detailFreq: 0.07, detailAmp: 0.8,
    octaves: 3, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.85,
    colorLow: [0.20, 0.18, 0.15], colorMid: [0.30, 0.28, 0.25],
    colorHigh: [0.38, 0.35, 0.32], colorPolar: [0.25, 0.23, 0.20],
    roughnessLow: 0.8, roughnessHigh: 0.95,
    skyZenith: [0, 0, 0], skyHorizon: [0, 0, 0],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
  },
  Titan: {
    continentFreq: 0.002, continentAmp: 12,
    mountainFreq: 0.01, mountainAmp: 5,
    detailFreq: 0.04, detailAmp: 1.5,
    octaves: 3, lacunarity: 2.3, diminish: 0.45,
    craterStrength: 0.05,
    colorLow: [0.20, 0.12, 0.05], colorMid: [0.55, 0.35, 0.12],
    colorHigh: [0.70, 0.50, 0.20], colorPolar: [0.45, 0.30, 0.10],
    roughnessLow: 0.5, roughnessHigh: 0.75,
    skyZenith: [0.80, 0.53, 0.27], skyHorizon: [0.85, 0.60, 0.20],
    skyHasSun: false, fogDensity: 0.5, fogColor: [0.80, 0.55, 0.20],
  },
  Miranda: {
    continentFreq: 0.005, continentAmp: 25,
    mountainFreq: 0.02, mountainAmp: 15,
    detailFreq: 0.08, detailAmp: 3.0,
    octaves: 3, lacunarity: 2.2, diminish: 0.5,
    craterStrength: 0.3,
    colorLow: [0.35, 0.33, 0.30], colorMid: [0.50, 0.48, 0.45],
    colorHigh: [0.65, 0.62, 0.58], colorPolar: [0.55, 0.55, 0.55],
    roughnessLow: 0.7, roughnessHigh: 0.9,
    skyZenith: [0, 0, 0], skyHorizon: [0, 0, 0],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
  },
  Triton: {
    continentFreq: 0.003, continentAmp: 15,
    mountainFreq: 0.02, mountainAmp: 8,
    detailFreq: 0.07, detailAmp: 2.0,
    octaves: 3, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.4,
    colorLow: [0.55, 0.50, 0.48], colorMid: [0.70, 0.68, 0.65],
    colorHigh: [0.82, 0.80, 0.78], colorPolar: [0.75, 0.72, 0.70],
    roughnessLow: 0.3, roughnessHigh: 0.6,
    skyZenith: [0.02, 0.02, 0.04], skyHorizon: [0.01, 0.01, 0.02],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
  },
  Pluto: {
    continentFreq: 0.002, continentAmp: 10,
    mountainFreq: 0.015, mountainAmp: 12,
    detailFreq: 0.06, detailAmp: 1.5,
    octaves: 3, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.15,
    colorLow: [0.70, 0.62, 0.58], colorMid: [0.80, 0.75, 0.72],
    colorHigh: [0.88, 0.85, 0.82], colorPolar: [0.90, 0.88, 0.85],
    roughnessLow: 0.3, roughnessHigh: 0.5,
    skyZenith: [0.03, 0.03, 0.04], skyHorizon: [0.02, 0.02, 0.03],
    skyHasSun: true, fogDensity: 0, fogColor: [0, 0, 0],
  },
  Charon: {
    continentFreq: 0.003, continentAmp: 12,
    mountainFreq: 0.012, mountainAmp: 18,
    detailFreq: 0.05, detailAmp: 1.0,
    octaves: 3, lacunarity: 2.0, diminish: 0.5,
    craterStrength: 0.25,
    colorLow: [0.35, 0.35, 0.37], colorMid: [0.48, 0.48, 0.50],
    colorHigh: [0.58, 0.58, 0.60], colorPolar: [0.50, 0.50, 0.52],
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

import { describe, expect, it } from 'vitest';
import { findNearestCellSpec, findNearbyPOI, findNearbyDeepSite, landHeightAt, generateChunk } from './worldGen';
import { generatePOI } from './structures';
import { cellHash, seedFromName } from './noise';
import { Chunk } from './chunk';
import { BLOCK, voxelId, chunkIndex, CHUNK_SIZE } from './voxelTypes';
import type { VoxelTerrainParams } from './voxelBiomes';
import type { POISpec, DeepDiscoverySpec, LakeSpec, LandmarkSpec } from './contentProfiles';

// Synthetic specs so the tests don't depend on shipped content data.
const ALWAYS = { id: 'test-poi', cell: 20, density: 1 }; // density 1: every cell places one
const NEVER = { id: 'test-none', cell: 20, density: -1 }; // density < 0: no cell ever passes

describe('findNearestCellSpec', () => {
  it('finds a deterministic anchor within range', () => {
    const a = findNearestCellSpec([ALWAYS], 1234, 0, 0, 40);
    const b = findNearestCellSpec([ALWAYS], 1234, 0, 0, 40);
    expect(a).not.toBeNull();
    expect(b).toMatchObject({ ax: a!.ax, az: a!.az, dist: a!.dist });
    expect(a!.dist).toBeLessThanOrEqual(40);
  });

  it('returns null when nothing places or nothing is in range', () => {
    expect(findNearestCellSpec([NEVER], 1234, 0, 0, 1000)).toBeNull();
    expect(findNearestCellSpec([], 1234, 0, 0, 1000)).toBeNull();
  });

  it('respects the spec filter', () => {
    const specs = [
      { ...ALWAYS, id: 'legacy', act: undefined as number | undefined },
      { ...ALWAYS, id: 'warlore', act: 3 as number | undefined },
    ];
    const legacy = findNearestCellSpec(specs, 42, 0, 0, 60, (s) => s.act === undefined);
    const war = findNearestCellSpec(specs, 42, 0, 0, 60, (s) => s.act !== undefined);
    expect(legacy?.spec.id).toBe('legacy');
    expect(war?.spec.id).toBe('warlore');
  });

  it('keeps the nearest of several placed anchors', () => {
    const hit = findNearestCellSpec([ALWAYS], 7, 3, -5, 200)!;
    // Every anchor inside the scanned grid is at least as far away as the winner.
    const cell = ALWAYS.cell;
    for (let gx = -10; gx <= 10; gx++) {
      for (let gz = -10; gz <= 10; gz++) {
        const other = findNearestCellSpec([ALWAYS], 7, gx * cell, gz * cell, 0.75 * cell);
        if (other) {
          expect(Math.hypot(3 - other.ax, -5 - other.az)).toBeGreaterThanOrEqual(hit.dist - 1e-9);
        }
      }
    }
  });

  it('reports which grid cell the winning instance came from', () => {
    const hit = findNearestCellSpec([ALWAYS], 7, 3, -5, 200)!;
    expect(Number.isInteger(hit.gx)).toBe(true);
    expect(Number.isInteger(hit.gz)).toBe(true);
  });
});

// Regression coverage for a real bug: the scanner measured distance to a POI's
// cell-hash anchor point only, never its actual generated footprint. A POI can
// span tens of voxels from that anchor (up to POI_MAX_HALF_EXTENT=32), so a
// player standing in a peripheral module of a large ruin — or anywhere the
// anchor itself happens to land inside solid terrain — could never get close
// enough to the anchor to trigger a scan.
describe('findNearbyPOI footprint correction', () => {
  // A single guaranteed placement (density 1, one huge cell) so the test
  // doesn't depend on scanning a grid to find an instance.
  const spec: POISpec = {
    id: 'poi-footprint-test',
    name: 'Footprint Test Ruin',
    type: 'processor',
    cell: 1000,
    density: 1,
  };
  const params = { archetype: 'rock', pois: [spec] } as unknown as VoxelTerrainParams;
  const seed = 999;

  function actualFootprint(gx: number, gz: number): [number, number] {
    const sSeed = seed + (seedFromName(spec.id) % 100000);
    const pSeed = Math.floor(cellHash(gx, gz, sSeed + 3) * 1e9);
    return generatePOI(spec.type, pSeed, params.archetype).footprint;
  }

  it('registers dist 0 for a point inside the footprint, even far from the anchor', () => {
    const hit = findNearbyPOI(params, seed, 0, 0, 5000)!;
    expect(hit).not.toBeNull();
    const [fw] = actualFootprint(hit.gx, hit.gz);

    // A point just inside the footprint's edge along whichever axis is wider —
    // for any structure with a non-trivial footprint this is meaningfully
    // farther from the anchor than the old anchor-only distance would allow.
    const halfW = fw / 2 - 0.5;
    const px = hit.ax + halfW;
    const pz = hit.az;
    const rawAnchorDist = Math.hypot(px - hit.ax, pz - hit.az);

    const corrected = findNearbyPOI(params, seed, px, pz, 5000)!;
    expect(corrected.dist).toBeCloseTo(0, 5);
    // Only a meaningful assertion if this structure actually has some width —
    // guards against a degenerate single-module generation for this seed.
    if (fw > 2) expect(rawAnchorDist).toBeGreaterThan(corrected.dist);
  });

  it('reduces (never increases) distance outside the footprint by the half-extent', () => {
    const hit = findNearbyPOI(params, seed, 0, 0, 5000)!;
    const [fw] = actualFootprint(hit.gx, hit.gz);
    const px = hit.ax + fw / 2 + 50;
    const pz = hit.az;

    const corrected = findNearbyPOI(params, seed, px, pz, 5000)!;
    expect(corrected.dist).toBeCloseTo(50, 5);
  });
});

describe('findNearbyDeepSite cylinder clamp', () => {
  // baseHeight with every noise amplitude at 0 makes columnHeight() collapse
  // to a constant, so the chamber's surface/anchor is fully predictable.
  const params = {
    baseHeight: 100,
    rollAmp: 0,
    rollFreq: 1,
    mountainAmp: 0,
    mountainFreq: 1,
    ridged: false,
    octaves: 1,
    duneAmp: 0,
    craters: 0,
    landmarks: [],
    lakes: [],
    deepSites: [
      {
        id: 'deep-test',
        name: 'Test Chamber',
        speculative: true,
        isLife: false,
        position: [0, 0],
        depthMin: 10,
        depthMax: 50,
        radius: 5,
        story: { base: '', human: '' },
      } as DeepDiscoverySpec,
    ],
  } as unknown as VoxelTerrainParams;
  const seed = 1;

  it('registers dist 0 at the top of a tall chamber, far from its vertical center', () => {
    // surface=100, depthMin=10 => must be at y<=90 to be "in the excavation".
    // ay (vertical center) = 100 - (10+50)/2 = 70, halfHeight = 20.
    // A player at y=90 is 20 above the center — exactly at the cylinder's own
    // ceiling, not near its center point. The old center-distance formula
    // would compute hypot(0,20,0)=20, missing it at anything under a 20-range.
    const hit = findNearbyDeepSite(params, seed, 0, 90, 0, 14);
    expect(hit).not.toBeNull();
    expect(hit!.dist).toBeCloseTo(0, 5);
  });

  it('still rejects a point genuinely outside the cylinder', () => {
    // 100 units away horizontally, well past radius(5) + maxDist(14).
    const outside = findNearbyDeepSite(params, seed, 100, 90, 0, 14);
    expect(outside).toBeNull();
  });
});

describe('detail/micro terrain perturbation', () => {
  // Every other height contributor zeroed so landHeightAt() isolates the new
  // detail/micro octaves (Phase 1 of the voxel-richness plan).
  const params = {
    baseHeight: 100,
    rollAmp: 0,
    rollFreq: 1,
    mountainAmp: 0,
    mountainFreq: 1,
    ridged: false,
    octaves: 1,
    detailFreq: 0.05,
    detailAmp: 2,
    microFreq: 0.3,
    microAmp: 0.6,
    duneAmp: 0,
    craters: 0,
    landmarks: [],
    lakes: [],
  } as unknown as VoxelTerrainParams;
  const seed = 42;

  it('is deterministic for a fixed seed and position', () => {
    const a = landHeightAt(17, -9, params, seed);
    const b = landHeightAt(17, -9, params, seed);
    expect(a).toBe(b);
  });

  it('stays within the combined detail+micro amplitude bound', () => {
    for (let wx = -50; wx <= 50; wx += 7) {
      for (let wz = -50; wz <= 50; wz += 11) {
        const h = landHeightAt(wx, wz, params, seed);
        expect(h).toBeGreaterThanOrEqual(params.baseHeight - params.detailAmp - params.microAmp - 1);
        expect(h).toBeLessThanOrEqual(params.baseHeight + params.detailAmp + params.microAmp + 1);
      }
    }
  });

  it('is a no-op when detailAmp/microAmp are both 0 (unaffected bodies stay unaffected)', () => {
    const flat = { ...params, detailAmp: 0, microAmp: 0 } as VoxelTerrainParams;
    expect(landHeightAt(17, -9, flat, seed)).toBe(params.baseHeight);
  });
});

describe('worm-tunnel cave carve (World Richness Phase 4)', () => {
  // Flat height field (baseHeight=50, every amplitude 0) so every voxel in a
  // chunk at cy=0 (wy 0..31) is deep underground (depth 19..50, always > 2).
  // caveThreshold is set above valueNoise3's max (1) so the existing blobby
  // cavern test can never fire — any AIR found must come from the new
  // worm-tunnel test in isolation.
  const baseParams = {
    archetype: 'rock',
    baseHeight: 50,
    rollAmp: 0,
    rollFreq: 1,
    mountainAmp: 0,
    mountainFreq: 1,
    ridged: false,
    octaves: 1,
    caveFreq: 0.1,
    caveThreshold: 1.1,
    detailAmp: 0,
    detailFreq: 1,
    microAmp: 0,
    microFreq: 1,
    cellNoiseAmp: 0,
    cellNoiseFreq: 1,
    craters: 0,
    waterLevel: -1,
    duneAmp: 0,
    glowDepth: 0,
    lavaLevel: -1,
    landmarks: [],
    lakes: [],
    pois: [],
    resources: [],
    scienceNotes: [],
    deepSites: [],
    translationFragments: [],
  } as unknown as VoxelTerrainParams;

  function countAir(params: VoxelTerrainParams): number {
    const chunk = new Chunk(0, 0, 0);
    generateChunk(chunk, params, 9001);
    let air = 0;
    for (let x = 0; x < CHUNK_SIZE; x++)
      for (let y = 0; y < CHUNK_SIZE; y++)
        for (let z = 0; z < CHUNK_SIZE; z++)
          if (voxelId(chunk.voxels[chunkIndex(x, y, z)]) === BLOCK.AIR) air++;
    return air;
  }

  it('carves nothing when caveTunnelWidth is 0 (disabled)', () => {
    const params = { ...baseParams, caveTunnelWidth: 0 } as VoxelTerrainParams;
    expect(countAir(params)).toBe(0);
  });

  it('carves worm-tunnel voids when caveTunnelWidth > 0, additive to the cavern test', () => {
    const params = { ...baseParams, caveTunnelWidth: 0.05 } as VoxelTerrainParams;
    // ~1% of the 32768 voxels are expected to fall inside the tunnel band;
    // the probability of zero hits given that rate is astronomically small.
    expect(countAir(params)).toBeGreaterThan(0);
  });
});

describe('layered rock band jitter (World Richness Phase 4)', () => {
  // Earth archetype: subsoil/rock boundary is a flat depth<=3 cutoff unless
  // cellNoiseAmp perturbs it. baseHeight=50 (flat) so depth is exactly
  // predictable at every column; the whole chunk at cy=0 sits below the
  // surface (wy 0..31, all depth > 0).
  const baseParams = {
    archetype: 'earth',
    baseHeight: 50,
    rollAmp: 0,
    rollFreq: 1,
    mountainAmp: 0,
    mountainFreq: 1,
    ridged: false,
    octaves: 1,
    caveFreq: 0.1,
    caveThreshold: 1.1, // no caves — isolate the layering logic
    caveTunnelWidth: 0,
    detailAmp: 0,
    detailFreq: 1,
    microAmp: 0,
    microFreq: 1,
    cellNoiseFreq: 0.05,
    craters: 0,
    waterLevel: -1,
    duneAmp: 0,
    glowDepth: 0,
    lavaLevel: -1,
    landmarks: [],
    lakes: [],
    pois: [],
    resources: [],
    scienceNotes: [],
    deepSites: [],
    translationFragments: [],
  } as unknown as VoxelTerrainParams;

  // depth = h - wy = 50 - wy; depth === 4 at wy === 46, which is chunk cy=1
  // (wy 32..63), local ly = 46 - 32 = 14.
  const DEPTH_4_LY = 14;

  function blocksAtDepth4(params: VoxelTerrainParams): Set<number> {
    const chunk = new Chunk(0, 1, 0);
    generateChunk(chunk, params, 9001);
    const found = new Set<number>();
    for (let x = 0; x < CHUNK_SIZE; x++)
      for (let z = 0; z < CHUNK_SIZE; z++)
        found.add(voxelId(chunk.voxels[chunkIndex(x, DEPTH_4_LY, z)]));
    return found;
  }

  it('is a flat ROCK boundary at depth 4 when cellNoiseAmp is 0', () => {
    const params = { ...baseParams, cellNoiseAmp: 0 } as VoxelTerrainParams;
    expect(blocksAtDepth4(params)).toEqual(new Set([BLOCK.ROCK]));
  });

  it('pushes SUBSOIL deeper at some columns when cellNoiseAmp > 0', () => {
    const params = { ...baseParams, cellNoiseAmp: 0.6 } as VoxelTerrainParams;
    const found = blocksAtDepth4(params);
    expect(found.has(BLOCK.SUBSOIL)).toBe(true);
  });
});

describe('lake carving + local water fill (World Richness Phase 6)', () => {
  // rock archetype + waterLevel/lavaLevel both -1: any WATER voxel found can
  // only come from the lake's own local fill, never a global sea.
  const lake: LakeSpec = { id: 'test-lake', cell: 100, density: 1, radius: 10, depth: 5 };
  const baseParams = {
    archetype: 'rock',
    baseHeight: 50,
    rollAmp: 0,
    rollFreq: 1,
    mountainAmp: 0,
    mountainFreq: 1,
    ridged: false,
    octaves: 1,
    caveFreq: 0.1,
    caveThreshold: 1.1,
    caveTunnelWidth: 0,
    detailAmp: 0,
    detailFreq: 1,
    microAmp: 0,
    microFreq: 1,
    cellNoiseAmp: 0,
    cellNoiseFreq: 1,
    craters: 0,
    waterLevel: -1,
    duneAmp: 0,
    glowDepth: 0,
    lavaLevel: -1,
    landmarks: [],
    lakes: [lake],
    pois: [],
    resources: [],
    scienceNotes: [],
    deepSites: [],
    translationFragments: [],
  } as unknown as VoxelTerrainParams;
  const seed = 555;

  function scanForBlock(params: VoxelTerrainParams, block: number, chunkSpan: number): boolean {
    for (let cx = 0; cx < chunkSpan; cx++) {
      for (let cz = 0; cz < chunkSpan; cz++) {
        for (let cy = 0; cy < 3; cy++) {
          const chunk = new Chunk(cx, cy, cz);
          generateChunk(chunk, params, seed);
          for (let i = 0; i < chunk.voxels.length; i++) {
            if (voxelId(chunk.voxels[i]) === block) return true;
          }
        }
      }
    }
    return false;
  }

  it('dips the height field at the lake (deterministic, same seed/position)', () => {
    // density=1 guarantees every checked cell registers an instance, so the
    // origin cell's own anchor is a real lake; its centre must be lower than
    // the flat 50 baseline everywhere else on this synthetic body.
    const atOrigin = landHeightAt(0, 0, baseParams, seed);
    const farAway = landHeightAt(1000, 1000, baseParams, seed);
    expect(farAway).toBe(50);
    expect(atOrigin).toBeLessThanOrEqual(farAway);
  });

  it('fills the basin with water even though the body has no global sea', () => {
    expect(scanForBlock(baseParams, BLOCK.WATER, 2)).toBe(true);
  });

  it('places no water at all when there are no lakes (no regression on dry archetypes)', () => {
    const dry = { ...baseParams, lakes: [] } as VoxelTerrainParams;
    expect(scanForBlock(dry, BLOCK.WATER, 2)).toBe(false);
  });
});

describe('river carving + water fill (World Richness Phase 6)', () => {
  const river: LandmarkSpec = {
    name: 'Test River',
    kind: 'river',
    position: [0, 0],
    radius: 4,
    amplitude: 6,
    points: [
      [10, 10],
      [10, 90],
    ],
  };
  const baseParams = {
    archetype: 'rock',
    baseHeight: 50,
    rollAmp: 0,
    rollFreq: 1,
    mountainAmp: 0,
    mountainFreq: 1,
    ridged: false,
    octaves: 1,
    caveFreq: 0.1,
    caveThreshold: 1.1,
    caveTunnelWidth: 0,
    detailAmp: 0,
    detailFreq: 1,
    microAmp: 0,
    microFreq: 1,
    cellNoiseAmp: 0,
    cellNoiseFreq: 1,
    craters: 0,
    waterLevel: -1,
    duneAmp: 0,
    glowDepth: 0,
    lavaLevel: -1,
    landmarks: [river],
    lakes: [],
    pois: [],
    resources: [],
    scienceNotes: [],
    deepSites: [],
    translationFragments: [],
  } as unknown as VoxelTerrainParams;
  const seed = 777;

  it('carves a trench along the polyline but leaves terrain off the path flat', () => {
    const onPath = landHeightAt(10, 50, baseParams, seed); // mid-segment
    const offPath = landHeightAt(500, 500, baseParams, seed); // far from the river
    expect(offPath).toBe(50);
    expect(onPath).toBeLessThan(offPath);
  });

  it('tapers to nothing well past the trench radius', () => {
    const farAcross = landHeightAt(10 + 100, 50, baseParams, seed); // 100 > radius(4)
    expect(farAcross).toBe(50);
  });

  it('fills the trench with water even though the body has no global sea', () => {
    let foundWater = false;
    for (let cx = 0; cx < 1 && !foundWater; cx++) {
      for (let cz = 0; cz < 3 && !foundWater; cz++) {
        for (let cy = 0; cy < 3 && !foundWater; cy++) {
          const chunk = new Chunk(cx, cy, cz);
          generateChunk(chunk, baseParams, seed);
          for (let i = 0; i < chunk.voxels.length; i++) {
            if (voxelId(chunk.voxels[i]) === BLOCK.WATER) {
              foundWater = true;
              break;
            }
          }
        }
      }
    }
    expect(foundWater).toBe(true);
  });
});

describe('voxel-embedded trees (Material Identity pass)', () => {
  const earthParams = {
    archetype: 'earth',
    baseHeight: 50,
    rollAmp: 0,
    rollFreq: 1,
    mountainAmp: 0,
    mountainFreq: 1,
    ridged: false,
    octaves: 1,
    caveFreq: 0.1,
    caveThreshold: 1.1,
    caveTunnelWidth: 0,
    detailAmp: 0,
    detailFreq: 1,
    microAmp: 0,
    microFreq: 1,
    cellNoiseAmp: 0,
    cellNoiseFreq: 1,
    craters: 0,
    waterLevel: -1,
    duneAmp: 0,
    glowDepth: 0,
    lavaLevel: -1,
    landmarks: [],
    lakes: [],
    pois: [],
    resources: [],
    scienceNotes: [],
    deepSites: [],
    translationFragments: [],
  } as unknown as VoxelTerrainParams;
  const seed = 314159;

  function scanForBlocks(params: VoxelTerrainParams, span: number): Set<number> {
    const found = new Set<number>();
    for (let cx = 0; cx < span; cx++) {
      for (let cz = 0; cz < span; cz++) {
        for (let cy = 0; cy < 3; cy++) {
          const chunk = new Chunk(cx, cy, cz);
          generateChunk(chunk, params, seed);
          for (let i = 0; i < chunk.voxels.length; i++) found.add(voxelId(chunk.voxels[i]));
        }
      }
    }
    return found;
  }

  it('places WOOD_LOG and LEAVES voxels on an earth-archetype body', () => {
    const blocks = scanForBlocks(earthParams, 3);
    expect(blocks.has(BLOCK.WOOD_LOG)).toBe(true);
    expect(blocks.has(BLOCK.LEAVES)).toBe(true);
  });

  it('places no tree voxels at all on a non-earth archetype (regression guard on the archetype gate)', () => {
    const rockParams = { ...earthParams, archetype: 'rock' } as VoxelTerrainParams;
    const blocks = scanForBlocks(rockParams, 3);
    expect(blocks.has(BLOCK.WOOD_LOG)).toBe(false);
    expect(blocks.has(BLOCK.LEAVES)).toBe(false);
  });

  it('is byte-identical across two generations with the same seed', () => {
    const a = new Chunk(1, 1, 1);
    const b = new Chunk(1, 1, 1);
    generateChunk(a, earthParams, seed);
    generateChunk(b, earthParams, seed);
    expect(a.voxels).toEqual(b.voxels);
  });
});

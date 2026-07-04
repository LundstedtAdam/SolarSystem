import { describe, expect, it } from 'vitest';
import { findNearestCellSpec, findNearbyPOI, findNearbyDeepSite, landHeightAt } from './worldGen';
import { generatePOI } from './structures';
import { cellHash, seedFromName } from './noise';
import type { VoxelTerrainParams } from './voxelBiomes';
import type { POISpec, DeepDiscoverySpec } from './contentProfiles';

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

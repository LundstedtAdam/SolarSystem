import { describe, expect, it } from 'vitest';
import { findNearestCellSpec } from './worldGen';

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
});

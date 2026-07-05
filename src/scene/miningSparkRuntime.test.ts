import { beforeEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { miningSparkRuntime } from './miningSparkRuntime';

describe('miningSparkRuntime.spawn', () => {
  beforeEach(() => {
    miningSparkRuntime.list = [];
    miningSparkRuntime.maxCount = 8;
  });

  it('spawns the requested number of particles up to the cap', () => {
    miningSparkRuntime.spawn(new Vector3(1, 2, 3), 4);
    expect(miningSparkRuntime.list).toHaveLength(4);
    for (const p of miningSparkRuntime.list) {
      expect(p.pos.equals(new Vector3(1, 2, 3))).toBe(true);
      expect(p.life).toBe(0);
      expect(p.maxLife).toBeGreaterThan(0);
    }
  });

  it('never exceeds maxCount even across multiple spawn calls', () => {
    miningSparkRuntime.spawn(new Vector3(), 6);
    miningSparkRuntime.spawn(new Vector3(), 6);
    expect(miningSparkRuntime.list.length).toBe(8);
  });

  it('spawns nothing once the pool is already full', () => {
    miningSparkRuntime.maxCount = 0;
    miningSparkRuntime.spawn(new Vector3(), 4);
    expect(miningSparkRuntime.list).toHaveLength(0);
  });
});

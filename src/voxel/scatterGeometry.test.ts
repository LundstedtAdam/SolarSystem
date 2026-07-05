import { describe, expect, it } from 'vitest';
import { crossedQuadGeometry } from './scatterGeometry';

describe('crossedQuadGeometry', () => {
  it('builds two crossed quads (12 vertices) with position, normal, and uv attributes', () => {
    const geo = crossedQuadGeometry(0.4, 0.5);
    const position = geo.getAttribute('position');
    const normal = geo.getAttribute('normal');
    const uv = geo.getAttribute('uv');
    expect(position.count).toBe(12);
    expect(normal.count).toBe(12);
    expect(uv).toBeDefined();
    expect(uv.count).toBe(12);
    expect(uv.itemSize).toBe(2);
  });

  it('maps each quad to a standard 0..1 unit-square UV, v=0 at the base (local y=0)', () => {
    const geo = crossedQuadGeometry(0.4, 0.5);
    const position = geo.getAttribute('position');
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i);
      const v = uv.getY(i);
      // Base-row vertices (local y=0) must map to v=0; top-row vertices
      // (local y=height) must map to v=1 — matches getBladeAlphaTexture's
      // root-to-tip row convention.
      if (y === 0) expect(v).toBe(0);
      else expect(v).toBe(1);
      expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getX(i)).toBeLessThanOrEqual(1);
    }
  });
});

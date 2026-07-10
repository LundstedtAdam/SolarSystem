import { describe, expect, it } from 'vitest';
import { resolveWheelSlice, WHEEL_DEADZONE_PX } from './voxelControls';

describe('resolveWheelSlice', () => {
  it('returns null for a drag inside the dead zone (no accidental selection on a tap)', () => {
    expect(resolveWheelSlice(0, 0)).toBeNull();
    expect(resolveWheelSlice(2, -3)).toBeNull();
    expect(resolveWheelSlice(WHEEL_DEADZONE_PX - 1, 0)).toBeNull();
  });

  it('picks the first slice (pickaxe) for a straight-up drag', () => {
    expect(resolveWheelSlice(0, -50)).toBe('pickaxe');
  });

  it('picks the second slice (gun) for a down-right drag', () => {
    // 120° clockwise from straight up.
    const angle = Math.PI / 2 + Math.PI / 6; // 120° measured from up
    const dx = Math.sin(angle) * 50;
    const dy = -Math.cos(angle) * 50;
    expect(resolveWheelSlice(dx, dy)).toBe('gun');
  });

  it('picks the third slice (flashlight) for a down-left drag', () => {
    const angle = -(Math.PI / 2 + Math.PI / 6); // 120° counterclockwise from up
    const dx = Math.sin(angle) * 50;
    const dy = -Math.cos(angle) * 50;
    expect(resolveWheelSlice(dx, dy)).toBe('flashlight');
  });

  it('is continuous across the wrap-around boundary (angle 0 / 2π)', () => {
    // Just past straight-down-left, still within the flashlight wedge
    // (180°-300°), and just past it should flip to pickaxe (300°-360°).
    const justInside = resolveWheelSlice(-Math.sin((5 * Math.PI) / 3 - 0.05) * 50, 50 * Math.cos((5 * Math.PI) / 3 - 0.05));
    expect(justInside).not.toBeNull();
  });

  it('every direction around the full circle resolves to one of the three slices', () => {
    for (let deg = 0; deg < 360; deg += 5) {
      const rad = (deg * Math.PI) / 180;
      const dx = Math.sin(rad) * 50;
      const dy = -Math.cos(rad) * 50;
      const slice = resolveWheelSlice(dx, dy);
      expect(['pickaxe', 'gun', 'flashlight']).toContain(slice);
    }
  });
});

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { voxelWheel, resolveWheelSlice, consumeWheelSelection, type ToolSlice } from '../voxel/voxelControls';

const SLICES: ToolSlice[] = ['pickaxe', 'gun', 'flashlight'];
/** Wedge center angles (degrees, 0 = up, clockwise) — must match
 *  `resolveWheelSlice`'s wedge boundaries in voxelControls.ts. */
const SLICE_ANGLE_DEG: Record<ToolSlice, number> = { pickaxe: 0, gun: 120, flashlight: 240 };
const SLICE_COLOR: Record<ToolSlice, string> = {
  pickaxe: '#9a9a9a',
  gun: '#ff8850',
  flashlight: '#ffd65a',
};
const LABEL_RADIUS = 78;

/**
 * Passive renderer for the hold-to-open radial tool selector — all the actual
 * input handling (desktop KeyQ hold, touch WheelButton drag) lives in
 * voxelControls.ts/VoxelTouchControls.tsx and just writes to the shared
 * `voxelWheel` object; this component polls it via rAF (same non-reactive
 * pattern as the rest of the on-foot HUD) and turns a resolved selection into
 * the actual `setActiveTool` store call — the one place in this feature that
 * needs both the input state and the store.
 */
export function ToolWheel() {
  const sceneMode = useStore((s) => s.sceneMode.type);
  const setActiveTool = useStore((s) => s.setActiveTool);
  const activeTool = useStore((s) => s.activeTool);
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<ToolSlice | null>(null);
  const raf = useRef(0);

  useEffect(() => {
    if (sceneMode !== 'voxel') return;
    let running = true;
    const tick = () => {
      if (!running) return;
      setOpen(voxelWheel.open);
      setHovered(voxelWheel.open ? resolveWheelSlice(voxelWheel.dx, voxelWheel.dy) : null);
      const selected = consumeWheelSelection();
      if (selected) setActiveTool(selected);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(raf.current);
    };
  }, [sceneMode, setActiveTool]);

  if (sceneMode !== 'voxel' || !open) return null;

  return (
    <div className="voxel-wheel" aria-hidden="true">
      <div
        className="voxel-wheel-ring"
        style={{
          background: `conic-gradient(from -60deg, ${SLICE_COLOR.pickaxe} 0deg 120deg, ${SLICE_COLOR.gun} 120deg 240deg, ${SLICE_COLOR.flashlight} 240deg 360deg)`,
        }}
      />
      {SLICES.map((slice) => {
        const rad = (SLICE_ANGLE_DEG[slice] * Math.PI) / 180;
        const x = Math.sin(rad) * LABEL_RADIUS;
        const y = -Math.cos(rad) * LABEL_RADIUS;
        const isActive = slice === activeTool;
        const isHovered = slice === hovered;
        return (
          <div
            key={slice}
            className={`voxel-wheel-label${isHovered ? ' hovered' : ''}${isActive ? ' equipped' : ''}`}
            style={{ transform: `translate(${x}px, ${y}px) translate(-50%, -50%)` }}
          >
            {t(slice).toUpperCase()}
          </div>
        );
      })}
    </div>
  );
}

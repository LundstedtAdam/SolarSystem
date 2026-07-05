// A single Minecraft-style inventory slot: a coloured icon swatch (reusing the
// existing per-resource/per-item colour tables — no new art assets) with the
// stack count badged in the corner. Purely presentational; selection/actions
// are owned by the caller. Designed for reuse anywhere a
// Partial<Record<K, number>> stack map is shown (backpack today; silo
// contents are the same shape and a natural future adopter).

export interface ItemSlotProps {
  /** 0..1 RGB, e.g. from RESOURCE_COLOR / CRAFTED_COLOR. */
  color: [number, number, number];
  count: number;
  label: string;
  active: boolean;
  /** Omit to render a non-interactive (display-only) slot. */
  onSelect?: () => void;
}

function rgbCss([r, g, b]: [number, number, number]): string {
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

export function ItemSlot({ color, count, label, active, onSelect }: ItemSlotProps) {
  const swatch = <span className="voxel-item-swatch" style={{ background: rgbCss(color) }} />;
  const badge = <span className="voxel-item-count">{count}</span>;

  if (!onSelect) {
    return (
      <div className="voxel-item-slot" aria-label={`${label} × ${count}`}>
        {swatch}
        {badge}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`voxel-item-slot${active ? ' active' : ''}`}
      onClick={onSelect}
      aria-label={`${label} × ${count}`}
      aria-pressed={active}
    >
      {swatch}
      {badge}
    </button>
  );
}

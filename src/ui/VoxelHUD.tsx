import { useEffect, useRef, useState } from 'react';
import { useStore, backpackUsed } from '../store';
import { voxelTelemetry, isTouchDevice } from '../voxel/voxelControls';
import type { ResourceType } from '../voxel/voxelTypes';

const RESOURCE_LABEL: Record<ResourceType, string> = {
  carbon: 'Carbon',
  silicon: 'Silicon',
  iron: 'Iron',
  copper: 'Copper',
  zinc: 'Zinc',
  wolframite: 'Wolframite',
  sphalerite: 'Sphalerite',
  malachite: 'Malachite',
  tungsten: 'Tungsten',
  titanite: 'Titanite',
  hematite: 'Hematite',
  lithium: 'Lithium',
  artifact: 'Artifact',
};

/** Compact backpack readout: capacity bar + carried resource stacks. Purely
 *  informational (non-interactive) so it sits top-left, clear of the thumbs. */
function Backpack() {
  const inventory = useStore((s) => s.inventory);
  const capacity = useStore((s) => s.backpackCapacity);
  const hasDrops = useStore((s) => s.drops.length > 0);
  const used = backpackUsed(inventory);
  const full = used >= capacity;
  const entries = (Object.keys(inventory) as ResourceType[])
    .filter((k) => (inventory[k] ?? 0) > 0)
    .sort();

  return (
    <div className="voxel-backpack">
      <div className="voxel-backpack-head">
        BACKPACK {used}/{capacity}
      </div>
      <div className="voxel-backpack-bar">
        <div
          className="voxel-backpack-fill"
          style={{ width: `${Math.min(100, (used / capacity) * 100)}%`, background: full ? '#ff7a5a' : undefined }}
        />
      </div>
      {entries.length === 0 ? (
        <div className="voxel-backpack-empty">Empty — mine ore veins</div>
      ) : (
        <div className="voxel-backpack-list">
          {entries.map((k) => (
            <div key={k} className="voxel-backpack-row">
              <span>{RESOURCE_LABEL[k]}</span>
              <span>{inventory[k]}</span>
            </div>
          ))}
        </div>
      )}
      {(full || hasDrops) && (
        <div className="voxel-backpack-warn">Full — resources are dropping. Build storage.</div>
      )}
    </div>
  );
}

// On-foot HUD: a compass that shows heading plus a marker pointing back to the
// ship (the disembark point at the world origin) with distance, and the Board
// ship action that returns to the Phase 8 surface view.
export function VoxelHUD() {
  const sceneMode = useStore((s) => s.sceneMode);
  const boardShip = useStore((s) => s.boardShip);
  const [hud, setHud] = useState({ heading: 0, shipAngle: 0, dist: 0 });
  const raf = useRef(0);

  useEffect(() => {
    if (sceneMode.type !== 'voxel') return;
    let running = true;
    const tick = () => {
      if (!running) return;
      const { x, z, yaw } = voxelTelemetry;
      // Heading: forward is (-sin yaw, -cos yaw); 0° = facing -Z (north).
      const heading = ((-yaw * 180) / Math.PI + 360) % 360;
      // Relative bearing of the ship (origin) from the player's facing.
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const len = Math.hypot(x, z) || 1;
      const tx = -x / len;
      const tz = -z / len;
      const dot = fx * tx + fz * tz;
      const cross = fx * tz - fz * tx;
      const shipAngle = (Math.atan2(cross, dot) * 180) / Math.PI; // 0 = ahead
      setHud({ heading, shipAngle, dist: Math.hypot(x, z) });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(raf.current);
    };
  }, [sceneMode.type]);

  if (sceneMode.type !== 'voxel') return null;

  const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const cardinal = cardinals[Math.round(hud.heading / 45) % 8];
  // On touch the Back action lives in the bottom 2x2 thumb cluster
  // (VoxelTouchControls); on desktop it stays here as a clickable button.
  const touch = isTouchDevice();
  // Ship marker placed on the ring at its relative bearing (up = ahead).
  const rad = (hud.shipAngle * Math.PI) / 180;
  const mx = 24 + Math.sin(rad) * 17;
  const my = 24 - Math.cos(rad) * 17;

  return (
    <div className="surface-hud">
      <div className="voxel-crosshair" aria-hidden="true" />
      <Backpack />
      <div className="surface-hud-top">
        <div className="surface-hud-name">{sceneMode.planet.toUpperCase()} — ON FOOT</div>
        <div className="surface-hud-compass">
          <svg width="56" height="56" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="22" fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
            {/* North needle rotates with heading */}
            <g transform={`rotate(${-hud.heading}, 24, 24)`}>
              <polygon points="24,5 27,20 24,17 21,20" fill="#ff4444" opacity="0.9" />
              <text x="24" y="46" textAnchor="middle" fontSize="6" fill="rgba(255,255,255,0.5)">N</text>
            </g>
            {/* Ship marker (relative bearing, up = ahead) */}
            <circle cx={mx} cy={my} r="3" fill="#7fd0ff" stroke="rgba(0,0,0,0.5)" strokeWidth="0.5" />
          </svg>
          <div className="surface-hud-cardinal">
            {hud.heading.toFixed(0)}° {cardinal} · ⛢ {hud.dist.toFixed(0)}m
          </div>
        </div>
      </div>

      {!touch && (
        <div className="surface-hud-actions">
          <button className="button surface-hud-action" onClick={boardShip}>
            <span className="actual-text">&nbsp;Board ship&nbsp;</span>
            <span aria-hidden="true" className="hover-text">&nbsp;Board ship&nbsp;</span>
          </button>
        </div>
      )}
    </div>
  );
}

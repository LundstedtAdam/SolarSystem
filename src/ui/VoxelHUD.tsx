import { useEffect, useRef, useState } from 'react';
import { useStore, backpackUsed, structureUsed } from '../store';
import { useT } from '../i18n';
import {
  voxelTelemetry,
  voxelStation,
  voxelSilo,
  consumeOpenSilo,
  isTouchDevice,
} from '../voxel/voxelControls';
import { BUILDABLES, BUILDABLE_IDS } from '../voxel/buildables';
import { RESOURCE_LABEL } from '../voxel/resourceProfiles';
import { CRAFTED_LABEL, type CraftedItem } from '../voxel/recipes';
import { planetPower } from '../voxel/power';
import { CraftMenu } from './CraftMenu';
import type { ResourceType } from '../voxel/voxelTypes';

type Menu = 'none' | 'backpack' | 'build' | 'craft' | 'silo';

function costLabel(cost: Partial<Record<ResourceType, number>>): string {
  return (Object.keys(cost) as ResourceType[])
    .map((k) => `${cost[k]} ${RESOURCE_LABEL[k]}`)
    .join(' + ');
}

function itemCostLabel(cost: Partial<Record<CraftedItem, number>>): string {
  return (Object.keys(cost) as CraftedItem[])
    .map((k) => `${cost[k]} ${CRAFTED_LABEL[k]}`)
    .join(' + ');
}

/** A drop position just in front of the player's feet, from live telemetry. */
function dropPos(): [number, number, number] {
  const { x, y, z, yaw } = voxelTelemetry;
  return [x - Math.sin(yaw) * 1.2, y, z - Math.cos(yaw) * 1.2];
}

/** The backpack as an open/close sheet: capacity, stacks, and a Drop per stack. */
function BackpackSheet({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const inventory = useStore((s) => s.inventory);
  const capacity = useStore((s) => s.backpackCapacity);
  const items = useStore((s) => s.items);
  const discardResource = useStore((s) => s.discardResource);
  const used = backpackUsed(inventory);
  const itemEntries = (Object.keys(items) as CraftedItem[]).filter((k) => (items[k] ?? 0) > 0);
  const full = used >= capacity;
  const entries = (Object.keys(inventory) as ResourceType[])
    .filter((k) => (inventory[k] ?? 0) > 0)
    .sort();

  return (
    <div className="voxel-sheet-backdrop" onClick={onClose}>
      <div className="voxel-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="voxel-sheet-head">
          <span>
            {t('backpack')} {used}/{capacity}
          </span>
          <button className="voxel-sheet-close" onClick={onClose}>
            {t('close')}
          </button>
        </div>
        <div className="voxel-backpack-bar">
          <div
            className="voxel-backpack-fill"
            style={{
              width: `${Math.min(100, (used / capacity) * 100)}%`,
              background: full ? '#ff7a5a' : undefined,
            }}
          />
        </div>
        {entries.length === 0 ? (
          <div className="voxel-backpack-empty">Empty — mine ore veins.</div>
        ) : (
          <div className="voxel-sheet-list">
            {entries.map((k) => (
              <div key={k} className="voxel-pack-row">
                <span className="voxel-pack-name">{RESOURCE_LABEL[k]}</span>
                <span className="voxel-pack-amount">{inventory[k]}</span>
                <button
                  className="voxel-drop-btn"
                  onClick={() => discardResource(k, inventory[k] ?? 0, dropPos())}
                >
                  {t('drop')}
                </button>
              </div>
            ))}
          </div>
        )}
        {itemEntries.length > 0 && (
          <>
            <div className="voxel-sheet-subhead">Items</div>
            <div className="voxel-sheet-list">
              {itemEntries.map((k) => (
                <div key={k} className="voxel-pack-row">
                  <span className="voxel-pack-name">{CRAFTED_LABEL[k]}</span>
                  <span className="voxel-pack-amount">{items[k]}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The build picker as an open/close sheet. Picking a buildable closes it. */
function BuildSheet({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const active = useStore((s) => s.activeBuildable);
  const setActive = useStore((s) => s.setActiveBuildable);
  const inventory = useStore((s) => s.inventory);
  const items = useStore((s) => s.items);

  return (
    <div className="voxel-sheet-backdrop" onClick={onClose}>
      <div className="voxel-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="voxel-sheet-head">
          <span>{t('build')}</span>
          <button className="voxel-sheet-close" onClick={onClose}>
            {t('close')}
          </button>
        </div>
        <div className="voxel-sheet-list">
          {BUILDABLE_IDS.map((id) => {
            const b = BUILDABLES[id];
            const resOk = (Object.keys(b.cost) as ResourceType[]).every(
              (k) => (inventory[k] ?? 0) >= (b.cost[k] ?? 0),
            );
            const itemOk = b.itemCost
              ? (Object.keys(b.itemCost) as CraftedItem[]).every(
                  (k) => (items[k] ?? 0) >= (b.itemCost?.[k] ?? 0),
                )
              : true;
            const affordable = resOk && itemOk;
            return (
              <button
                key={id}
                className={`voxel-build-btn${active === id ? ' active' : ''}`}
                onClick={() => {
                  setActive(id);
                  onClose();
                }}
              >
                <span>{t(id)}</span>
                <span className={`voxel-build-cost${affordable ? '' : ' short'}`}>
                  {costLabel(b.cost)}
                  {b.itemCost ? ` + ${itemCostLabel(b.itemCost)}` : ''}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** The silo contents as an open/close sheet: capacity, stacks, and a Take per
 *  stack that pulls it back into the backpack (capped by free backpack space,
 *  with clear feedback when a withdrawal is capped or blocked entirely). Also
 *  offers the existing "deposit everything" action for convenience. */
function SiloSheet({ structureId, onClose }: { structureId: number; onClose: () => void }) {
  const { t } = useT();
  const structures = useStore((s) => s.structures);
  const inventory = useStore((s) => s.inventory);
  const capacity = useStore((s) => s.backpackCapacity);
  const withdrawFromStructure = useStore((s) => s.withdrawFromStructure);
  const depositToStructure = useStore((s) => s.depositToStructure);
  const [notice, setNotice] = useState<string | null>(null);
  const silo = structures.find((s) => s.id === structureId);

  if (!silo) {
    onClose();
    return null;
  }

  const used = structureUsed(silo);
  const packSpace = Math.max(0, capacity - backpackUsed(inventory));
  const entries = (Object.keys(silo.stored) as ResourceType[])
    .filter((k) => (silo.stored[k] ?? 0) > 0)
    .sort();

  const take = (type: ResourceType, amount: number) => {
    const got = withdrawFromStructure(structureId, type, amount);
    if (got < amount) {
      setNotice(got === 0 ? 'Backpack full — nothing withdrawn.' : `Backpack full — only ${got} taken.`);
      setTimeout(() => setNotice(null), 3000);
    }
  };

  return (
    <div className="voxel-sheet-backdrop" onClick={onClose}>
      <div className="voxel-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="voxel-sheet-head">
          <span>
            {t('silo')} {used}/{silo.capacity}
          </span>
          <button className="voxel-sheet-close" onClick={onClose}>
            {t('close')}
          </button>
        </div>
        {packSpace <= 0 && (
          <div className="voxel-sheet-warn">Backpack full — free space to withdraw.</div>
        )}
        {entries.length === 0 ? (
          <div className="voxel-backpack-empty">Empty.</div>
        ) : (
          <div className="voxel-sheet-list">
            {entries.map((k) => (
              <div key={k} className="voxel-pack-row">
                <span className="voxel-pack-name">{RESOURCE_LABEL[k]}</span>
                <span className="voxel-pack-amount">{silo.stored[k]}</span>
                <button
                  className="voxel-take-btn"
                  disabled={packSpace <= 0}
                  onClick={() => take(k, silo.stored[k] ?? 0)}
                >
                  {t('take')}
                </button>
              </div>
            ))}
          </div>
        )}
        {notice && <div className="voxel-sheet-notice">{notice}</div>}
        <button className="craft-confirm" onClick={() => depositToStructure(structureId)}>
          {t('deposit')} All
        </button>
      </div>
    </div>
  );
}

// On-foot HUD: compass + ship beacon, the open/close Backpack & Build menus, and
// (desktop) the Board-ship action.
export function VoxelHUD() {
  const sceneMode = useStore((s) => s.sceneMode);
  const boardShip = useStore((s) => s.boardShip);
  const inventory = useStore((s) => s.inventory);
  const capacity = useStore((s) => s.backpackCapacity);
  const activeBuildable = useStore((s) => s.activeBuildable);
  const structures = useStore((s) => s.structures);
  const { t } = useT();
  const [hud, setHud] = useState({ heading: 0, shipAngle: 0, dist: 0 });
  const [menu, setMenu] = useState<Menu>('none');
  const [stationAvail, setStationAvail] = useState(false);
  const [siloAvail, setSiloAvail] = useState(false);
  const raf = useRef(0);

  // Opening a menu frees the desktop cursor (pointer-lock) so it can click.
  const openMenu = (target: Menu) => {
    setMenu((prev) => {
      const next = prev === target ? 'none' : target;
      if (next !== 'none' && document.pointerLockElement) document.exitPointerLock();
      return next;
    });
  };

  // Desktop keys: Tab → backpack, B → build, C → craft (near a station),
  // V → silo contents (near a silo), Esc → close.
  useEffect(() => {
    if (sceneMode.type !== 'voxel') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        openMenu('backpack');
      } else if (e.code === 'KeyB') {
        openMenu('build');
      } else if (e.code === 'KeyC') {
        if (voxelStation.available) openMenu('craft');
      } else if (e.code === 'KeyV') {
        if (voxelSilo.available) openMenu('silo');
      } else if (e.code === 'Escape') {
        setMenu('none');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sceneMode.type]);

  // Poll station/silo proximity for the contextual Craft/Silo buttons (and
  // auto-close their menus when the player walks away); also consume the
  // gamepad's edge-triggered open-silo request (RB), since a controller can't
  // click the HTML button directly.
  useEffect(() => {
    if (sceneMode.type !== 'voxel') return;
    const id = setInterval(() => {
      setStationAvail(voxelStation.available);
      if (!voxelStation.available) setMenu((m) => (m === 'craft' ? 'none' : m));
      setSiloAvail(voxelSilo.available);
      if (!voxelSilo.available) setMenu((m) => (m === 'silo' ? 'none' : m));
      if (consumeOpenSilo() && voxelSilo.available) openMenu('silo');
    }, 150);
    return () => clearInterval(id);
  }, [sceneMode.type]);

  // Close menus when leaving the voxel world.
  useEffect(() => {
    if (sceneMode.type !== 'voxel') setMenu('none');
  }, [sceneMode.type]);

  useEffect(() => {
    if (sceneMode.type !== 'voxel') return;
    let running = true;
    const tick = () => {
      if (!running) return;
      const { x, z, yaw } = voxelTelemetry;
      const heading = ((-yaw * 180) / Math.PI + 360) % 360;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const len = Math.hypot(x, z) || 1;
      const tx = -x / len;
      const tz = -z / len;
      const dot = fx * tx + fz * tz;
      const cross = fx * tz - fz * tx;
      const shipAngle = (Math.atan2(cross, dot) * 180) / Math.PI;
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
  const touch = isTouchDevice();
  const rad = (hud.shipAngle * Math.PI) / 180;
  const mx = 24 + Math.sin(rad) * 17;
  const my = 24 - Math.cos(rad) * 17;
  const used = backpackUsed(inventory);
  const power = planetPower(structures, sceneMode.planet);
  const hasPowerStructures = structures.some(
    (s) =>
      s.planet === sceneMode.planet &&
      (s.type === 'solar' || s.type === 'wind' || s.type === 'thermal' || s.type === 'refinery'),
  );

  return (
    <div className="surface-hud">
      <div className="voxel-crosshair" aria-hidden="true" />

      {/* Top-right menu toggles (also serve as compact indicators). */}
      <div className="voxel-menu-toggles">
        {hasPowerStructures && (
          <div className={`voxel-power-chip${power.generated >= power.consumed ? '' : ' short'}`}>
            ⚡ {t('power')} {power.generated}/{power.consumed}
          </div>
        )}
        <button
          className={`voxel-toggle-btn${menu === 'backpack' ? ' active' : ''}`}
          onClick={() => openMenu('backpack')}
        >
          {t('backpack')} {used}/{capacity}
        </button>
        <button
          className={`voxel-toggle-btn${menu === 'build' ? ' active' : ''}`}
          onClick={() => openMenu('build')}
        >
          {t('build')}: {t(activeBuildable)}
        </button>
      </div>

      {/* Contextual Craft opener — shown when standing at a station. */}
      {stationAvail && menu === 'none' && (
        <button className="voxel-craft-open" onClick={() => openMenu('craft')}>
          {t('craft')}
        </button>
      )}
      {/* Contextual Silo opener — shown when standing at a silo; view/withdraw. */}
      {siloAvail && menu === 'none' && (
        <button className="voxel-silo-open" onClick={() => openMenu('silo')}>
          {t('silo')}
        </button>
      )}

      {menu === 'backpack' && <BackpackSheet onClose={() => setMenu('none')} />}
      {menu === 'build' && <BuildSheet onClose={() => setMenu('none')} />}
      {menu === 'craft' && voxelStation.id >= 0 && (
        <CraftMenu stationId={voxelStation.id} onClose={() => setMenu('none')} />
      )}
      {menu === 'silo' && voxelSilo.id >= 0 && (
        <SiloSheet structureId={voxelSilo.id} onClose={() => setMenu('none')} />
      )}

      <div className="surface-hud-top">
        <div className="surface-hud-name">{sceneMode.planet.toUpperCase()} — ON FOOT</div>
        <div className="surface-hud-compass">
          <svg width="56" height="56" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="22" fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
            <g transform={`rotate(${-hud.heading}, 24, 24)`}>
              <polygon points="24,5 27,20 24,17 21,20" fill="#ff4444" opacity="0.9" />
              <text x="24" y="46" textAnchor="middle" fontSize="6" fill="rgba(255,255,255,0.5)">N</text>
            </g>
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

import { useEffect, useState } from 'react';
import { Vector3 } from 'three';
import { useStore } from '../store';
import { useT } from '../i18n';
import { findNearestLandable, landRange } from '../descent/descentHelpers';
import { isLandable, PLANETS } from '../systems/bodies';
import { RESOURCE_LABEL } from '../voxel/resourceProfiles';
import { CRAFTED_LABEL } from '../voxel/recipes';
import { UPGRADE_KINDS, UPGRADE_COSTS, UPGRADE_MAX_TIER } from '../ship/upgrades';
import type { ResourceType } from '../voxel/voxelTypes';
import type { CraftedItem } from '../voxel/recipes';

function costLabel(cost: { resources: Partial<Record<ResourceType, number>>; items?: Partial<Record<CraftedItem, number>> }): string {
  const parts: string[] = [];
  for (const k in cost.resources) parts.push(`${cost.resources[k as ResourceType]} ${RESOURCE_LABEL[k as ResourceType]}`);
  if (cost.items) for (const k in cost.items) parts.push(`${cost.items[k as CraftedItem]} ${CRAFTED_LABEL[k as CraftedItem]}`);
  return parts.join(' + ');
}

/** All bodies a quick-nav autopilot can fly to: every planet plus every moon. */
function navDestinations(): string[] {
  const out: string[] = [];
  for (const p of PLANETS) {
    out.push(p.name);
    for (const m of p.moons) out.push(m.name);
  }
  return out;
}

export function ShipHUD() {
  const sceneMode = useStore((s) => s.sceneMode);
  const exitShip = useStore((s) => s.exitShip);
  const beginDescent = useStore((s) => s.beginDescent);
  const shipVelocity = useStore((s) => s.shipVelocity);
  const shipPosition = useStore((s) => s.shipPosition);
  const shipThrottle = useStore((s) => s.shipThrottle);
  const simTimeDays = useStore((s) => s.simTimeDays);
  const autopilotTarget = useStore((s) => s.autopilotTarget);
  const startAutopilot = useStore((s) => s.startAutopilot);
  const cancelAutopilot = useStore((s) => s.cancelAutopilot);
  const navOpen = useStore((s) => s.navPickerOpen);
  const setNavOpen = useStore((s) => s.setNavPickerOpen);
  const shipUpgrades = useStore((s) => s.shipUpgrades);
  const upgradeShip = useStore((s) => s.upgradeShip);
  const inventory = useStore((s) => s.inventory);
  const items = useStore((s) => s.items);
  const descentBlocked = useStore((s) => s.descentBlocked);
  const setDescentBlocked = useStore((s) => s.setDescentBlocked);
  const toggleSettings = useStore((s) => s.toggleSettings);
  const { t, name } = useT();
  const [upgradesOpen, setUpgradesOpen] = useState(false);

  // Auto-dismiss the "why can't I land" toast after a few seconds.
  useEffect(() => {
    if (!descentBlocked) return;
    const id = setTimeout(() => setDescentBlocked(null), 4500);
    return () => clearTimeout(id);
  }, [descentBlocked, setDescentBlocked]);

  if (sceneMode.type !== 'piloting') return null;

  const speed = Math.sqrt(
    shipVelocity[0] ** 2 + shipVelocity[1] ** 2 + shipVelocity[2] ** 2,
  ).toFixed(0);

  const _shipPos = new Vector3(...shipPosition);
  const nearest = findNearestLandable(_shipPos, simTimeDays);
  const canLand = nearest && nearest.distance < landRange(nearest.size);
  const landable = canLand ? isLandable(nearest.name) : false;
  const thrPct = (shipThrottle * 100).toFixed(0);
  // Final-quarter (75–100%) intensity, smooth 0 -> 1, drives the heat glow.
  const lastQ = Math.min(Math.max((shipThrottle - 0.75) / 0.25, 0), 1);
  const heatGlow = lastQ * lastQ * (3 - 2 * lastQ);
  const inPowerBand = shipThrottle >= 0.75;

  return (
    <>
      {/* Heat glow at the screen edges — intensifies through the final quarter */}
      {heatGlow > 0 && (
        <div className="ship-heat-glow" style={{ opacity: heatGlow }} aria-hidden="true">
          <div className="ship-heat-glow-inner" />
        </div>
      )}

      {/* Throttle indicator — upper center; four zones of the response curve */}
      <div className="throttle-indicator" aria-hidden="true">
        <div className="ti-track">
          <div
            className={`ti-fill${inPowerBand ? ' ti-fill--power' : ''}`}
            style={{ width: `${shipThrottle * 100}%` }}
          />
          <span className="ti-div" style={{ left: '25%' }} />
          <span className="ti-div" style={{ left: '50%' }} />
          <span className="ti-div" style={{ left: '75%' }} />
        </div>
        <div className="ti-readout">THR {thrPct}%</div>
      </div>

      {/* Telemetry — bottom left, above touch joystick zone */}
      <div className="ship-hud-telemetry">
        <div>SPD {speed}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>THR {thrPct}%</span>
          <div className="ship-hud-thr-track">
            <div className="ship-hud-thr-fill" style={{ width: `${shipThrottle * 100}%` }} />
          </div>
        </div>
        {nearest && (
          <div style={{ marginTop: 4, opacity: 0.7 }}>
            {name(nearest.name)} {nearest.distance.toFixed(0)}u
          </div>
        )}
      </div>

      {/* Quick-nav destination picker — bottom sheet within thumb reach */}
      {navOpen && (
        <div className="ship-nav-backdrop" onClick={() => setNavOpen(false)}>
          <div className="ship-nav-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="ship-nav-head">{t('navigate')}</div>
            <div className="ship-nav-grid">
              {navDestinations().map((bodyName) => (
                <button
                  key={bodyName}
                  className="ship-nav-item"
                  onClick={() => {
                    startAutopilot(bodyName);
                    setNavOpen(false);
                  }}
                >
                  {name(bodyName)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Ship-upgrades sheet — resource-gated tiers for quantum drive/scanner/
          shielding/cargo (Phase 11.5). Reuses the nav-sheet bottom-sheet
          pattern so it's a consistent, thumb-reachable overlay. */}
      {upgradesOpen && (
        <div className="ship-nav-backdrop" onClick={() => setUpgradesOpen(false)}>
          <div className="ship-nav-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="ship-nav-head">{t('upgrades')}</div>
            <div className="upgrades-list">
              {UPGRADE_KINDS.map((kind) => {
                const tier = shipUpgrades[kind];
                const maxed = tier >= UPGRADE_MAX_TIER;
                const cost = !maxed ? UPGRADE_COSTS[kind][tier] : null;
                const affordable =
                  cost !== null &&
                  Object.entries(cost.resources).every(
                    ([k, n]) => (inventory[k as ResourceType] ?? 0) >= (n ?? 0),
                  ) &&
                  (!cost.items ||
                    Object.entries(cost.items).every(
                      ([k, n]) => (items[k as CraftedItem] ?? 0) >= (n ?? 0),
                    ));
                return (
                  <div key={kind} className="upgrade-row">
                    <div className="upgrade-row-head">
                      <span className="upgrade-name">{t(kind)}</span>
                      <span className="upgrade-tier-dots">
                        {Array.from({ length: UPGRADE_MAX_TIER }, (_, i) => (
                          <span key={i} className={`upgrade-dot${i < tier ? ' upgrade-dot--on' : ''}`} />
                        ))}
                      </span>
                    </div>
                    {maxed ? (
                      <div className="upgrade-cost">{t('upgradeMax')}</div>
                    ) : (
                      <>
                        <div className="upgrade-cost">{costLabel(cost!)}</div>
                        <button
                          className="button upgrade-btn"
                          disabled={!affordable}
                          onClick={() => upgradeShip(kind)}
                        >
                          {affordable ? t('upgrade') : t('needResources')}
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Land-blocked explanation — brief, dismissible. Shielding is the only
          descent gate left in the game (see ship/upgrades.ts). */}
      {descentBlocked && <div className="descent-blocked-toast">{t('blockedShielding')}</div>}

      {/* Bottom-center action cluster — dedicated, always-visible buttons within
          thumb reach. Navigate and Exit are always shown; Land appears when a
          landable body is in range; Cancel appears while autopilot is flying. */}
      <div className="ship-hud-actions">
        <button className="button ship-hud-action" onClick={() => setNavOpen(!navOpen)}>
          <span className="actual-text">&nbsp;{t('navigate')}&nbsp;</span>
          <span aria-hidden="true" className="hover-text">&nbsp;{t('navigate')}&nbsp;</span>
        </button>
        <button className="button ship-hud-action" onClick={() => setUpgradesOpen(!upgradesOpen)}>
          <span className="actual-text">&nbsp;{t('upgrades')}&nbsp;</span>
          <span aria-hidden="true" className="hover-text">&nbsp;{t('upgrades')}&nbsp;</span>
        </button>
        {canLand && (
          <button
            className="button ship-hud-action ship-hud-land"
            onClick={() => beginDescent(nearest.name)}
            style={{ color: landable ? undefined : '#ff6666' }}
          >
            <span className="actual-text">&nbsp;Land&nbsp;</span>
            <span aria-hidden="true" className="hover-text">&nbsp;Land&nbsp;</span>
          </button>
        )}
        {autopilotTarget && (
          <button className="button ship-hud-action ship-hud-cancel" onClick={cancelAutopilot}>
            <span className="actual-text">&nbsp;{t('cancel')} ▸ {name(autopilotTarget)}&nbsp;</span>
            <span aria-hidden="true" className="hover-text">
              &nbsp;{t('cancel')} ▸ {name(autopilotTarget)}&nbsp;
            </span>
          </button>
        )}
        <button className="button ship-hud-action" onClick={exitShip}>
          <span className="actual-text">&nbsp;{t('exit')}&nbsp;</span>
          <span aria-hidden="true" className="hover-text">&nbsp;{t('exit')}&nbsp;</span>
        </button>
        <button className="button ship-hud-action" onClick={toggleSettings} aria-label={t('settings')}>
          <span className="actual-text">&nbsp;⚙&nbsp;</span>
          <span aria-hidden="true" className="hover-text">&nbsp;⚙&nbsp;</span>
        </button>
      </div>
    </>
  );
}

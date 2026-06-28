import { Vector3 } from 'three';
import { useStore } from '../store';
import { useT } from '../i18n';
import { findNearestLandable, landRange } from '../descent/descentHelpers';
import { isLandable, PLANETS } from '../systems/bodies';

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
  const { t, name } = useT();

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

      {/* Bottom-center action cluster — dedicated, always-visible buttons within
          thumb reach. Navigate and Exit are always shown; Land appears when a
          landable body is in range; Cancel appears while autopilot is flying. */}
      <div className="ship-hud-actions">
        <button className="button ship-hud-action" onClick={() => setNavOpen(!navOpen)}>
          <span className="actual-text">&nbsp;{t('navigate')}&nbsp;</span>
          <span aria-hidden="true" className="hover-text">&nbsp;{t('navigate')}&nbsp;</span>
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
      </div>
    </>
  );
}

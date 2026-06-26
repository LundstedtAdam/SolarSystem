import { Vector3 } from 'three';
import { useStore } from '../store';
import { useT } from '../i18n';
import { findNearestLandable } from '../descent/descentHelpers';
import { isLandable } from '../systems/bodies';

function landRange(bodySize: number): number {
  return bodySize * 3.5 + 15;
}

export function ShipHUD() {
  const sceneMode = useStore((s) => s.sceneMode);
  const exitShip = useStore((s) => s.exitShip);
  const beginDescent = useStore((s) => s.beginDescent);
  const shipVelocity = useStore((s) => s.shipVelocity);
  const shipPosition = useStore((s) => s.shipPosition);
  const shipThrottle = useStore((s) => s.shipThrottle);
  const simTimeDays = useStore((s) => s.simTimeDays);
  const { t } = useT();

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

      {/* Exit button — top right */}
      <button
        className="button ship-hud-exit"
        onClick={exitShip}
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          zIndex: 10,
          minWidth: 44,
          minHeight: 44,
        }}
      >
        <span className="actual-text">&nbsp;{t('reset')}&nbsp;</span>
        <span aria-hidden="true" className="hover-text">&nbsp;{t('reset')}&nbsp;</span>
      </button>

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
            {nearest.name} {nearest.distance.toFixed(0)}u
          </div>
        )}
      </div>

      {/* Land button — bottom center */}
      {canLand && (
        <button
          className="button ship-hud-land"
          onClick={() => beginDescent(nearest.name)}
          style={{ color: landable ? undefined : '#ff6666' }}
        >
          <span className="actual-text">&nbsp;Land&nbsp;</span>
          <span aria-hidden="true" className="hover-text">&nbsp;Land&nbsp;</span>
        </button>
      )}
    </>
  );
}

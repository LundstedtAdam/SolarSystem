import { Vector3 } from 'three';
import { useStore } from '../store';
import { useT } from '../i18n';
import { findNearestLandable } from '../descent/descentHelpers';
import { isLandable } from '../systems/bodies';

const LAND_RANGE = 80;

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
  const canLand = nearest && nearest.distance < LAND_RANGE;
  const landable = canLand ? isLandable(nearest.name) : false;

  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        right: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignItems: 'flex-end',
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      <button
        className="button"
        onClick={exitShip}
        style={{ pointerEvents: 'auto', minWidth: 44, minHeight: 44 }}
      >
        <span className="actual-text">&nbsp;{t('reset')}&nbsp;</span>
        <span aria-hidden="true" className="hover-text">&nbsp;{t('reset')}&nbsp;</span>
      </button>
      <div
        style={{
          background: 'rgba(0,0,0,0.5)',
          borderRadius: 6,
          padding: '6px 12px',
          color: 'rgba(255,255,255,0.8)',
          fontSize: 12,
          fontFamily: 'monospace',
          pointerEvents: 'none',
        }}
      >
        <div>SPD {speed}</div>
        <div>THR {(shipThrottle * 100).toFixed(0)}%</div>
        {nearest && (
          <div style={{ marginTop: 4, opacity: 0.7 }}>
            {nearest.name} {nearest.distance.toFixed(0)}u
          </div>
        )}
      </div>
      {canLand && (
        <button
          className="button"
          onClick={() => beginDescent(nearest.name)}
          style={{
            pointerEvents: 'auto',
            minWidth: 80,
            minHeight: 54,
            fontSize: 16,
            color: landable ? undefined : '#ff6666',
          }}
        >
          <span className="actual-text">
            &nbsp;{landable ? 'Land' : 'Land'}&nbsp;
          </span>
          <span aria-hidden="true" className="hover-text">
            &nbsp;{landable ? 'Land' : 'Land'}&nbsp;
          </span>
        </button>
      )}
    </div>
  );
}

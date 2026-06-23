import { useStore } from '../store';
import { useT } from '../i18n';

export function ShipHUD() {
  const sceneMode = useStore((s) => s.sceneMode);
  const exitShip = useStore((s) => s.exitShip);
  const shipVelocity = useStore((s) => s.shipVelocity);
  const shipThrottle = useStore((s) => s.shipThrottle);
  const { t } = useT();

  if (sceneMode.type !== 'piloting') return null;

  const speed = Math.sqrt(
    shipVelocity[0] ** 2 + shipVelocity[1] ** 2 + shipVelocity[2] ** 2,
  ).toFixed(0);

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
      </div>
    </div>
  );
}

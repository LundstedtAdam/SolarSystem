import { useEffect, useState } from 'react';
import { Vector3 } from 'three';
import { useStore } from '../store';
import { resolveDescentTarget } from '../descent/descentHelpers';

export function DescentOverlay() {
  const sceneMode = useStore((s) => s.sceneMode);
  const abortDescent = useStore((s) => s.abortDescent);
  const shipPosition = useStore((s) => s.shipPosition);
  const simTimeDays = useStore((s) => s.simTimeDays);
  const [isGasGiant, setIsGasGiant] = useState(false);

  useEffect(() => {
    if (sceneMode.type !== 'descending') {
      setIsGasGiant(false);
      return;
    }
    const t = resolveDescentTarget(sceneMode.target, simTimeDays);
    if (t) setIsGasGiant(t.isGasGiant);
  }, [sceneMode, simTimeDays]);

  if (sceneMode.type !== 'descending') return null;

  const target = resolveDescentTarget(sceneMode.target, simTimeDays);
  const altitude = target
    ? new Vector3(...shipPosition).distanceTo(target.worldPos).toFixed(0)
    : '---';

  const phaseLabel =
    sceneMode.phase === 'orbit'
      ? 'ORBITAL APPROACH'
      : sceneMode.phase === 'atmosphere'
        ? 'ATMOSPHERIC ENTRY'
        : 'LANDING';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        pointerEvents: 'none',
        zIndex: 20,
        padding: '24px 16px',
      }}
    >
      <div
        style={{
          background: 'rgba(0,0,0,0.6)',
          borderRadius: 8,
          padding: '8px 20px',
          color: isGasGiant ? '#ff4444' : 'rgba(255,255,255,0.9)',
          fontSize: 14,
          fontFamily: 'monospace',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 2 }}>
          {sceneMode.target.toUpperCase()}
        </div>
        {isGasGiant ? (
          <div style={{ fontWeight: 'bold', fontSize: 16 }}>
            UNABLE TO LAND — GAS GIANT
          </div>
        ) : (
          <>
            <div style={{ fontWeight: 'bold' }}>{phaseLabel}</div>
            <div style={{ fontSize: 12, marginTop: 2 }}>ALT {altitude}</div>
          </>
        )}
      </div>

      {sceneMode.phase === 'atmosphere' && !isGasGiant && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            pointerEvents: 'none',
            background: `radial-gradient(ellipse at center, transparent 30%, rgba(255, 120, 30, ${
              0.15
            }) 100%)`,
            mixBlendMode: 'screen',
          }}
        />
      )}

      <button
        className="button"
        onClick={abortDescent}
        style={{
          pointerEvents: 'auto',
          minWidth: 80,
          minHeight: 54,
          fontSize: 16,
        }}
      >
        <span className="actual-text">&nbsp;Abort&nbsp;</span>
        <span aria-hidden="true" className="hover-text">
          &nbsp;Abort&nbsp;
        </span>
      </button>
    </div>
  );
}

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
    <div className="descent-overlay">
      <div className="descent-overlay-info" style={{
        color: isGasGiant ? '#ff4444' : 'rgba(255,255,255,0.9)',
      }}>
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
        <div className="descent-overlay-heat" />
      )}

      <button className="button descent-overlay-abort" onClick={abortDescent}>
        <span className="actual-text">&nbsp;Abort&nbsp;</span>
        <span aria-hidden="true" className="hover-text">&nbsp;Abort&nbsp;</span>
      </button>
    </div>
  );
}

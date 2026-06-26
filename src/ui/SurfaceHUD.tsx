import { useRef, useEffect, useState } from 'react';
import { useStore } from '../store';

export function SurfaceHUD() {
  const sceneMode = useStore((s) => s.sceneMode);
  const beginAscent = useStore((s) => s.beginAscent);
  const disembark = useStore((s) => s.disembark);
  const [heading, setHeading] = useState(0);
  const frameRef = useRef(0);

  useEffect(() => {
    if (sceneMode.type !== 'surface') return;
    let running = true;
    const tick = () => {
      if (!running) return;
      const [qx, qy, qz, qw] = useStore.getState().shipRotation;
      const sinY = 2 * (qw * qy - qz * qx);
      const cosY = 1 - 2 * (qx * qx + qy * qy);
      const yaw = Math.atan2(sinY, cosY);
      const deg = ((yaw * 180) / Math.PI + 360) % 360;
      setHeading(deg);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(frameRef.current);
    };
  }, [sceneMode.type]);

  if (sceneMode.type !== 'surface') return null;

  const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const cardinal = cardinals[Math.round(heading / 45) % 8];

  return (
    <div className="surface-hud">
      {/* Top: planet name + compass */}
      <div className="surface-hud-top">
        <div className="surface-hud-name">
          {sceneMode.planet.toUpperCase()} — SURFACE
        </div>
        <div className="surface-hud-compass">
          <svg width="48" height="48" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="22" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
            <g transform={`rotate(${-heading}, 24, 24)`}>
              <polygon points="24,6 27,20 24,18 21,20" fill="#ff4444" opacity="0.9" />
              <polygon points="24,42 27,28 24,30 21,28" fill="rgba(255,255,255,0.4)" />
            </g>
          </svg>
          <div className="surface-hud-cardinal">
            {heading.toFixed(0)}° {cardinal}
          </div>
        </div>
      </div>

      {/* Bottom: disembark to explore on foot, or launch back to orbit. */}
      <div className="surface-hud-actions">
        <button className="button surface-hud-action" onClick={disembark}>
          <span className="actual-text">&nbsp;Disembark&nbsp;</span>
          <span aria-hidden="true" className="hover-text">&nbsp;Disembark&nbsp;</span>
        </button>
        <button className="button surface-hud-action" onClick={beginAscent}>
          <span className="actual-text">&nbsp;Launch&nbsp;</span>
          <span aria-hidden="true" className="hover-text">&nbsp;Launch&nbsp;</span>
        </button>
      </div>
    </div>
  );
}

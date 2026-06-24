import { useStore } from '../store';

export function SurfaceHUD() {
  const sceneMode = useStore((s) => s.sceneMode);
  const beginAscent = useStore((s) => s.beginAscent);

  if (sceneMode.type !== 'surface') return null;

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
        zIndex: 10,
        padding: '24px 16px',
      }}
    >
      <div
        style={{
          background: 'rgba(0,0,0,0.5)',
          borderRadius: 8,
          padding: '6px 16px',
          color: 'rgba(255,255,255,0.85)',
          fontSize: 14,
          fontFamily: 'monospace',
        }}
      >
        {sceneMode.planet.toUpperCase()} — SURFACE
      </div>
      <button
        className="button"
        onClick={beginAscent}
        style={{
          pointerEvents: 'auto',
          minWidth: 80,
          minHeight: 54,
          fontSize: 16,
        }}
      >
        <span className="actual-text">&nbsp;Launch&nbsp;</span>
        <span aria-hidden="true" className="hover-text">
          &nbsp;Launch&nbsp;
        </span>
      </button>
    </div>
  );
}

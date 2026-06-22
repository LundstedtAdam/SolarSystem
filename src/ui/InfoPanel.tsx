import { useStore } from '../store';

/** Bottom info panel describing the selected body (legacy derived values). */
export function InfoPanel() {
  const selected = useStore((s) => s.selected);
  const reset = useStore((s) => s.reset);

  if (!selected) return null;

  return (
    <div className="info-panel">
      <button className="close-btn" onClick={reset}>
        ×
      </button>
      <div className="info-content">
        <div className="avatar-container">
          <img src="/assets/astro.webp" alt="Friendly robot guide" className="robot-avatar" />
        </div>
        <div className="info-text">
          <h2>{selected.name}</h2>
          <p>Diameter: {(selected.size * 1274).toLocaleString()} km</p>
          <p>Avstånd från solen: {(selected.distance * 15).toLocaleString()} miljoner km</p>
          <p>Omloppshastighet: {selected.speed}x</p>
        </div>
      </div>
    </div>
  );
}

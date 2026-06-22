import { useStore } from '../store';

const AU_KM = 149_597_870.7;

function periodLabel(days: number): string {
  const retro = days < 0 ? ' (retrograd)' : '';
  const d = Math.abs(days);
  if (d >= 730) return `${(d / 365.25).toFixed(2)} år${retro}`;
  if (d >= 2) return `${d.toFixed(2)} dygn${retro}`;
  return `${(d * 24).toFixed(1)} timmar${retro}`;
}

/** Info panel showing the selected body's real physical & orbital data. */
export function InfoPanel() {
  const selected = useStore((s) => s.selected);
  const reset = useStore((s) => s.reset);

  if (!selected) return null;

  const diameterKm = Math.round(selected.radiusKm * 2);

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
          <p>Diameter: {diameterKm.toLocaleString()} km</p>
          {selected.semiMajorAxisAU !== undefined && (
            <p>
              Avstånd från solen: {selected.semiMajorAxisAU.toFixed(2)} AE (
              {Math.round((selected.semiMajorAxisAU * AU_KM) / 1_000_000).toLocaleString()} miljoner km)
            </p>
          )}
          <p>Omloppstid: {periodLabel(selected.orbitalPeriodDays)}</p>
          {selected.eccentricity !== undefined && (
            <p>Excentricitet: {selected.eccentricity.toFixed(4)}</p>
          )}
          {selected.rotationPeriodDays !== undefined && (
            <p>Rotationstid: {periodLabel(selected.rotationPeriodDays)}</p>
          )}
          {selected.axialTiltDeg !== undefined && (
            <p>Axellutning: {selected.axialTiltDeg.toFixed(2)}°</p>
          )}
        </div>
      </div>
    </div>
  );
}

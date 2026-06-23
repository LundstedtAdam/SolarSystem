import { useStore } from '../store';
import { useT, type StringKey } from '../i18n';

const AU_KM = 149_597_870.7;

/** Localized period label, e.g. "1.88 yr", "27.32 days", "9.9 hours (retrograde)". */
function periodLabel(days: number, t: (k: StringKey) => string): string {
  const retro = days < 0 ? ` (${t('retrograde')})` : '';
  const d = Math.abs(days);
  if (d >= 730) return `${(d / 365.25).toFixed(2)} ${t('years')}${retro}`;
  if (d >= 2) return `${d.toFixed(2)} ${t('days')}${retro}`;
  return `${(d * 24).toFixed(1)} ${t('hours')}${retro}`;
}

/** Redesigned info panel: localized real data + a body thumbnail. */
export function InfoPanel() {
  const selected = useStore((s) => s.selected);
  const reset = useStore((s) => s.reset);
  const { t, name } = useT();

  if (!selected) return null;

  const diameterKm = Math.round(selected.radiusKm * 2);

  return (
    <div className="info-panel" role="dialog" aria-label={name(selected.name)}>
      <button className="close-btn" onClick={reset} aria-label={t('close')}>
        ×
      </button>
      <div className="info-content">
        <div className="info-thumb">
          {selected.thumbnail && <img src={selected.thumbnail} alt="" />}
        </div>
        <div className="info-text">
          <h2>{name(selected.name)}</h2>
          <dl>
            <dt>{t('diameter')}</dt>
            <dd>{diameterKm.toLocaleString()} km</dd>
            {selected.semiMajorAxisAU !== undefined && (
              <>
                <dt>{t('distanceFromSun')}</dt>
                <dd>
                  {selected.semiMajorAxisAU.toFixed(2)} AU ·{' '}
                  {Math.round((selected.semiMajorAxisAU * AU_KM) / 1_000_000).toLocaleString()}{' '}
                  {t('millionKm')}
                </dd>
              </>
            )}
            <dt>{t('orbitalPeriod')}</dt>
            <dd>{periodLabel(selected.orbitalPeriodDays, t)}</dd>
            {selected.eccentricity !== undefined && (
              <>
                <dt>{t('eccentricity')}</dt>
                <dd>{selected.eccentricity.toFixed(4)}</dd>
              </>
            )}
            {selected.rotationPeriodDays !== undefined && (
              <>
                <dt>{t('rotationPeriod')}</dt>
                <dd>{periodLabel(selected.rotationPeriodDays, t)}</dd>
              </>
            )}
            {selected.axialTiltDeg !== undefined && (
              <>
                <dt>{t('axialTilt')}</dt>
                <dd>{selected.axialTiltDeg.toFixed(2)}°</dd>
              </>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
}

import { useStore } from '../store';
import { useT } from '../i18n';
import { dateFromDays } from '../systems/ephemeris';
import { QUALITY_ORDER } from '../systems/quality';

/** Modal settings: language, labels, reduced motion, date, audio. */
export function SettingsPanel() {
  const open = useStore((s) => s.settingsOpen);
  const toggleSettings = useStore((s) => s.toggleSettings);
  const language = useStore((s) => s.language);
  const setLanguage = useStore((s) => s.setLanguage);
  const showLabels = useStore((s) => s.showLabels);
  const toggleLabels = useStore((s) => s.toggleLabels);
  const reducedMotion = useStore((s) => s.reducedMotion);
  const setReducedMotion = useStore((s) => s.setReducedMotion);
  const volume = useStore((s) => s.volume);
  const setVolume = useStore((s) => s.setVolume);
  const muted = useStore((s) => s.muted);
  const toggleMuted = useStore((s) => s.toggleMuted);
  const dayInt = useStore((s) => Math.floor(s.simTimeDays));
  const setDate = useStore((s) => s.setDate);
  const quality = useStore((s) => s.quality);
  const setQuality = useStore((s) => s.setQuality);
  const controls = useStore((s) => s.controls);
  const setControls = useStore((s) => s.setControls);
  const { t } = useT();

  if (!open) return null;

  const isoDate = dateFromDays(dayInt).toISOString().slice(0, 10);

  return (
    <div className="settings-overlay" onClick={toggleSettings}>
      <div
        className="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t('settings')}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="close-btn" onClick={toggleSettings} aria-label={t('close')}>
          ×
        </button>
        <h2>{t('settings')}</h2>

        <div className="setting-row">
          <span>{t('language')}</span>
          <div className="seg" role="group" aria-label={t('language')}>
            <button className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>
              English
            </button>
            <button className={language === 'sv' ? 'active' : ''} onClick={() => setLanguage('sv')}>
              Svenska
            </button>
          </div>
        </div>

        <div className="setting-row">
          <span>{t('quality')}</span>
          <div className="seg" role="group" aria-label={t('quality')}>
            {QUALITY_ORDER.map((q) => (
              <button
                key={q}
                className={quality === q ? 'active' : ''}
                onClick={() => setQuality(q)}
              >
                {q[0].toUpperCase() + q.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="setting-row">
          <label>
            <input type="checkbox" checked={showLabels} onChange={toggleLabels} /> {t('labels')}
          </label>
        </div>

        <div className="setting-row">
          <label>
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(e) => setReducedMotion(e.target.checked)}
            />{' '}
            {t('reducedMotion')}
          </label>
        </div>

        <div className="setting-row">
          <label htmlFor="date-input">{t('date')}</label>
          <input
            id="date-input"
            type="date"
            value={isoDate}
            onChange={(e) => {
              const d = new Date(e.target.value);
              if (!Number.isNaN(d.getTime())) setDate(d);
            }}
          />
        </div>

        <div className="setting-row">
          <label htmlFor="settings-volume">{t('volume')}</label>
          <input
            id="settings-volume"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={muted ? 0 : volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
          />
          <button onClick={toggleMuted}>{muted ? t('unmute') : t('mute')}</button>
        </div>

        <div className="setting-row">
          <span style={{ fontWeight: 600 }}>{t('flightControls')}</span>
        </div>

        <div className="setting-row">
          <label htmlFor="ctrl-sensitivity">{t('sensitivity')}</label>
          <input
            id="ctrl-sensitivity"
            type="range"
            min="0.3"
            max="2"
            step="0.05"
            value={controls.sensitivity}
            onChange={(e) => setControls({ sensitivity: parseFloat(e.target.value) })}
          />
        </div>

        <div className="setting-row">
          <label htmlFor="ctrl-mousesens">{t('mouseSensitivity')}</label>
          <input
            id="ctrl-mousesens"
            type="range"
            min="0.3"
            max="3"
            step="0.05"
            value={controls.mouseSensitivity}
            onChange={(e) => setControls({ mouseSensitivity: parseFloat(e.target.value) })}
          />
        </div>

        <div className="setting-row">
          <label htmlFor="ctrl-deadzone">{t('deadzone')}</label>
          <input
            id="ctrl-deadzone"
            type="range"
            min="0.05"
            max="0.2"
            step="0.01"
            value={controls.deadzone}
            onChange={(e) => setControls({ deadzone: parseFloat(e.target.value) })}
          />
        </div>

        <div className="setting-row">
          <label>
            <input
              type="checkbox"
              checked={controls.invertPitch}
              onChange={(e) => setControls({ invertPitch: e.target.checked })}
            />{' '}
            {t('invertPitch')}
          </label>
        </div>

        <div className="setting-row">
          <label>
            <input
              type="checkbox"
              checked={controls.flightAssist}
              onChange={(e) => setControls({ flightAssist: e.target.checked })}
            />{' '}
            {t('flightAssist')}
          </label>
        </div>

        <div className="setting-row">
          <label>
            <input
              type="checkbox"
              checked={controls.fineControl}
              onChange={(e) => setControls({ fineControl: e.target.checked })}
            />{' '}
            {t('fineControl')}
          </label>
        </div>
      </div>
    </div>
  );
}

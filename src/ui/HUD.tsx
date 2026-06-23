import { useStore } from '../store';
import { useT } from '../i18n';
import { dateFromDays } from '../systems/ephemeris';

/** Top control bar: simulated date, time-scale, and primary actions. */
export function HUD() {
  const speed = useStore((s) => s.speed);
  const setSpeed = useStore((s) => s.setSpeed);
  const toggleOrbits = useStore((s) => s.toggleOrbits);
  const reset = useStore((s) => s.reset);
  const paused = useStore((s) => s.paused);
  const togglePause = useStore((s) => s.togglePause);
  const tourActive = useStore((s) => s.tourActive);
  const toggleTour = useStore((s) => s.toggleTour);
  const toggleSettings = useStore((s) => s.toggleSettings);
  const enterShip = useStore((s) => s.enterShip);
  const sceneMode = useStore((s) => s.sceneMode);
  const dayInt = useStore((s) => Math.floor(s.simTimeDays));
  const { t, lang } = useT();

  const dateLabel = dateFromDays(dayInt).toLocaleDateString(lang === 'sv' ? 'sv-SE' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="ui">
      <div className="control">
        <div className="date">{dateLabel}</div>
        <label htmlFor="speed">{t('timeScale')}:</label>
        <label className="slider">
          <input
            type="range"
            className="level"
            id="speed"
            min="0.1"
            max="20"
            step="0.1"
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
          />
          <output className="value" htmlFor="speed">
            {speed}x
          </output>
        </label>
      </div>
      <button className="button" onClick={togglePause} aria-pressed={paused}>
        <span className="actual-text">&nbsp;{paused ? t('play') : t('pause')}&nbsp;</span>
        <span aria-hidden="true" className="hover-text">
          &nbsp;{paused ? t('play') : t('pause')}&nbsp;
        </span>
      </button>
      <button className="button" onClick={toggleTour} aria-pressed={tourActive}>
        <span className="actual-text">&nbsp;{tourActive ? t('stop') : t('tour')}&nbsp;</span>
        <span aria-hidden="true" className="hover-text">
          &nbsp;{tourActive ? t('stop') : t('tour')}&nbsp;
        </span>
      </button>
      <button className="button" onClick={toggleOrbits}>
        <span className="actual-text">&nbsp;{t('orbits')}&nbsp;</span>
        <span aria-hidden="true" className="hover-text">
          &nbsp;{t('orbits')}&nbsp;
        </span>
      </button>
      <button className="button" onClick={reset}>
        <span className="actual-text">&nbsp;{t('reset')}&nbsp;</span>
        <span aria-hidden="true" className="hover-text">
          &nbsp;{t('reset')}&nbsp;
        </span>
      </button>
      <button className="button" onClick={toggleSettings}>
        <span className="actual-text">&nbsp;{t('settings')}&nbsp;</span>
        <span aria-hidden="true" className="hover-text">
          &nbsp;{t('settings')}&nbsp;
        </span>
      </button>
      {sceneMode.type === 'solar' && (
        <button className="button" onClick={enterShip} style={{ minWidth: 44, minHeight: 44 }}>
          <span className="actual-text">&nbsp;Fly&nbsp;</span>
          <span aria-hidden="true" className="hover-text">&nbsp;Fly&nbsp;</span>
        </button>
      )}
    </div>
  );
}

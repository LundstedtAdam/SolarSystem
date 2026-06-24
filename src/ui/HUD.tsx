import { useState } from 'react';
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
  const [drawerOpen, setDrawerOpen] = useState(false);

  const dateLabel = dateFromDays(dayInt).toLocaleDateString(lang === 'sv' ? 'sv-SE' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const isSolar = sceneMode.type === 'solar';

  if (!isSolar) return null;

  const actionButtons = (
    <>
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
      <button className="button" onClick={enterShip} style={{ minWidth: 44, minHeight: 44 }}>
        <span className="actual-text">&nbsp;Fly&nbsp;</span>
        <span aria-hidden="true" className="hover-text">&nbsp;Fly&nbsp;</span>
      </button>
    </>
  );

  return (
    <>
      {/* Desktop layout — unchanged */}
      <div className="ui ui-desktop">
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
        {actionButtons}
      </div>

      {/* Mobile layout — hamburger + drawer */}
      <div className="ui-mobile-bar">
        <div className="mobile-date">{dateLabel}</div>
        <button
          className="hamburger-btn"
          onClick={() => setDrawerOpen(!drawerOpen)}
          aria-label="Menu"
          aria-expanded={drawerOpen}
        >
          <span className={`hamburger-icon ${drawerOpen ? 'open' : ''}`}>
            <span />
            <span />
            <span />
          </span>
        </button>
      </div>

      {drawerOpen && (
        <div className="mobile-drawer-backdrop" onClick={() => setDrawerOpen(false)}>
          <nav
            className="mobile-drawer"
            onClick={(e) => e.stopPropagation()}
            role="navigation"
          >
            <div className="drawer-section">
              <label htmlFor="speed-mobile">{t('timeScale')}:</label>
              <label className="slider">
                <input
                  type="range"
                  className="level"
                  id="speed-mobile"
                  min="0.1"
                  max="20"
                  step="0.1"
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                />
                <output className="value" htmlFor="speed-mobile">
                  {speed}x
                </output>
              </label>
            </div>
            <div className="drawer-actions">
              <button className="drawer-btn" onClick={() => { togglePause(); setDrawerOpen(false); }}>
                {paused ? t('play') : t('pause')}
              </button>
              <button className="drawer-btn" onClick={() => { toggleTour(); setDrawerOpen(false); }}>
                {tourActive ? t('stop') : t('tour')}
              </button>
              <button className="drawer-btn" onClick={() => { toggleOrbits(); setDrawerOpen(false); }}>
                {t('orbits')}
              </button>
              <button className="drawer-btn" onClick={() => { reset(); setDrawerOpen(false); }}>
                {t('reset')}
              </button>
              <button className="drawer-btn" onClick={() => { toggleSettings(); setDrawerOpen(false); }}>
                {t('settings')}
              </button>
              <button className="drawer-btn drawer-btn-fly" onClick={() => { enterShip(); setDrawerOpen(false); }}>
                Fly
              </button>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}

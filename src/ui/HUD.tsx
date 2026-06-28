import { useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { dateFromDays } from '../systems/ephemeris';
import { PLANETS } from '../systems/bodies';

/** Top bar (date + hamburger) and the single navigation drawer. The drawer holds
 *  two sections — Actions and Bodies — so the body list is no longer pinned to
 *  the screen edge. Used on every viewport; the persistent picker is gone. */
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
  const focusIndex = useStore((s) => s.focusIndex);
  const focusPlanetByIndex = useStore((s) => s.focusPlanetByIndex);
  const { t, name, lang } = useT();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const dateLabel = dateFromDays(dayInt).toLocaleDateString(lang === 'sv' ? 'sv-SE' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  if (sceneMode.type !== 'solar') return null;

  const close = () => setDrawerOpen(false);
  const act = (fn: () => void) => () => {
    fn();
    close();
  };

  return (
    <>
      <div className="ui-mobile-bar">
        <div className="mobile-date">{dateLabel}</div>
        <button
          className="hamburger-btn"
          onClick={() => setDrawerOpen(!drawerOpen)}
          aria-label={t('menu')}
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
        <div className="mobile-drawer-backdrop" onClick={close}>
          <nav
            className="mobile-drawer"
            onClick={(e) => e.stopPropagation()}
            role="navigation"
            aria-label={t('menu')}
          >
            {/* Section 1 — Actions */}
            <div className="drawer-heading">{t('actions')}</div>
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
              <button className="drawer-btn" onClick={act(togglePause)}>
                {paused ? t('play') : t('pause')}
              </button>
              <button className="drawer-btn" onClick={act(toggleTour)}>
                {tourActive ? t('stop') : t('tour')}
              </button>
              <button className="drawer-btn" onClick={act(toggleOrbits)}>
                {t('orbits')}
              </button>
              <button className="drawer-btn" onClick={act(reset)}>
                {t('reset')}
              </button>
              <button className="drawer-btn" onClick={act(toggleSettings)}>
                {t('settings')}
              </button>
              <button className="drawer-btn drawer-btn-fly" onClick={act(enterShip)}>
                {t('fly')}
              </button>
            </div>

            {/* Section 2 — Bodies */}
            <div className="drawer-heading drawer-heading-bodies">{t('bodies')}</div>
            <div className="drawer-bodies">
              {PLANETS.map((p, i) => (
                <button
                  key={p.name}
                  className={`drawer-body-btn${focusIndex === i ? ' active' : ''}`}
                  aria-current={focusIndex === i}
                  onClick={act(() => focusPlanetByIndex(i))}
                >
                  {name(p.name)}
                </button>
              ))}
            </div>
          </nav>
        </div>
      )}
    </>
  );
}

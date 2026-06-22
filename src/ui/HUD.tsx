import { useStore } from '../store';
import { dateFromDays } from '../systems/ephemeris';

/** Top control bar: simulated date, time-scale, pause, orbit toggle, reset. */
export function HUD() {
  const speed = useStore((s) => s.speed);
  const setSpeed = useStore((s) => s.setSpeed);
  const toggleOrbits = useStore((s) => s.toggleOrbits);
  const reset = useStore((s) => s.reset);
  const paused = useStore((s) => s.paused);
  const togglePause = useStore((s) => s.togglePause);
  const tourActive = useStore((s) => s.tourActive);
  const toggleTour = useStore((s) => s.toggleTour);
  const volume = useStore((s) => s.volume);
  const setVolume = useStore((s) => s.setVolume);
  const muted = useStore((s) => s.muted);
  const toggleMuted = useStore((s) => s.toggleMuted);
  // Re-render only when the whole day changes, not every frame.
  const dayInt = useStore((s) => Math.floor(s.simTimeDays));

  const dateLabel = dateFromDays(dayInt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="ui">
      <div className="control">
        <div className="date">{dateLabel}</div>
        <label htmlFor="speed">Time scale:</label>
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
        <label htmlFor="volume">Volume:</label>
        <label className="slider">
          <input
            type="range"
            className="level"
            id="volume"
            min="0"
            max="1"
            step="0.01"
            value={muted ? 0 : volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
          />
          <output className="value" htmlFor="volume">
            {Math.round((muted ? 0 : volume) * 100)}
          </output>
        </label>
      </div>
      <button className="button" onClick={togglePause}>
        <span className="actual-text">&nbsp;{paused ? 'Play' : 'Pause'}&nbsp;</span>
        <span aria-hidden="true" className="hover-text">
          &nbsp;{paused ? 'Play' : 'Pause'}&nbsp;
        </span>
      </button>
      <button className="button" onClick={toggleTour}>
        <span className="actual-text">&nbsp;{tourActive ? 'Stop' : 'Tour'}&nbsp;</span>
        <span aria-hidden="true" className="hover-text">
          &nbsp;{tourActive ? 'Stop' : 'Tour'}&nbsp;
        </span>
      </button>
      <button className="button" onClick={toggleOrbits}>
        <span className="actual-text">&nbsp;Orbits&nbsp;</span>
        <span aria-hidden="true" className="hover-text">
          &nbsp;Orbits&nbsp;
        </span>
      </button>
      <button className="button" onClick={reset}>
        <span className="actual-text">&nbsp;Reset&nbsp;</span>
        <span aria-hidden="true" className="hover-text">
          &nbsp;Reset&nbsp;
        </span>
      </button>
      <button className="button" onClick={toggleMuted}>
        <span className="actual-text">&nbsp;{muted ? 'Unmute' : 'Mute'}&nbsp;</span>
        <span aria-hidden="true" className="hover-text">
          &nbsp;{muted ? 'Unmute' : 'Mute'}&nbsp;
        </span>
      </button>
    </div>
  );
}

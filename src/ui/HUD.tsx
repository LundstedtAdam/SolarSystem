import { useStore } from '../store';

/** Top control bar: speed slider, orbit toggle, camera reset. */
export function HUD() {
  const speed = useStore((s) => s.speed);
  const setSpeed = useStore((s) => s.setSpeed);
  const toggleOrbits = useStore((s) => s.toggleOrbits);
  const reset = useStore((s) => s.reset);

  return (
    <div className="ui">
      <div className="control">
        <label htmlFor="speed">Speed:</label>
        <label className="slider">
          <input
            type="range"
            className="level"
            id="speed"
            min="0.1"
            max="10"
            step="0.1"
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
          />
          <output className="value" htmlFor="speed">
            {speed}x
          </output>
        </label>
      </div>
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
    </div>
  );
}

import { useStore } from '../store';
import { useT } from '../i18n';
import { PLANETS } from '../systems/bodies';
import { labelEls } from '../scene/labelRegistry';

/**
 * DOM overlay of planet name labels. Positions are written each frame by
 * LabelProjector (in-canvas); clicking a label focuses that planet.
 */
export function Labels() {
  const showLabels = useStore((s) => s.showLabels);
  const focusPlanetByIndex = useStore((s) => s.focusPlanetByIndex);
  const { name } = useT();

  if (!showLabels) return null;

  return (
    <div className="labels-overlay" aria-hidden="true">
      {PLANETS.map((p, i) => (
        <button
          key={p.name}
          ref={(el) => {
            labelEls[p.name] = el;
          }}
          className="scene-label-btn"
          style={{ opacity: 0 }}
          onClick={() => focusPlanetByIndex(i)}
        >
          {name(p.name)}
        </button>
      ))}
    </div>
  );
}

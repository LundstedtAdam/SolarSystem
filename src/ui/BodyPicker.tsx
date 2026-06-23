import { useStore } from '../store';
import { useT } from '../i18n';
import { PLANETS } from '../systems/bodies';

/** Vertical list of planets; click to focus the camera on one. */
export function BodyPicker() {
  const focusIndex = useStore((s) => s.focusIndex);
  const focusPlanetByIndex = useStore((s) => s.focusPlanetByIndex);
  const { t, name } = useT();

  return (
    <nav className="body-picker" aria-label={t('bodies')}>
      {PLANETS.map((p, i) => (
        <button
          key={p.name}
          className={`picker-item${focusIndex === i ? ' active' : ''}`}
          aria-current={focusIndex === i}
          onClick={() => focusPlanetByIndex(i)}
        >
          {name(p.name)}
        </button>
      ))}
    </nav>
  );
}

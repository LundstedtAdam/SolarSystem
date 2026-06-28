import { useEffect } from 'react';
import { Vector3 } from 'three';
import { useStore } from '../store';
import { findNearestLandable, landRange } from '../descent/descentHelpers';

const TOUR_INTERVAL_MS = 7000;

/** Keyboard shortcuts + tour-mode auto-advance. Renders nothing. */
export function Controls() {
  const tourActive = useStore((s) => s.tourActive);

  // Keyboard navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      const s = useStore.getState();
      switch (e.key) {
        case 'Escape':
          s.reset();
          break;
        case 'ArrowRight':
          s.cycleFocus(1);
          break;
        case 'ArrowLeft':
          s.cycleFocus(-1);
          break;
        case 't':
        case 'T':
          s.toggleTour();
          break;
        case 'o':
        case 'O':
          s.toggleOrbits();
          break;
        case 'l':
        case 'L':
          s.toggleLabels();
          break;
        case ' ':
          e.preventDefault();
          s.togglePause();
          break;
        case 'f':
        case 'F':
          if (s.sceneMode.type === 'solar') s.enterShip();
          else if (s.sceneMode.type === 'piloting') s.exitShip();
          break;
        case 'g':
        case 'G':
          if (s.sceneMode.type === 'piloting') {
            const nearest = findNearestLandable(new Vector3(...s.shipPosition), s.simTimeDays);
            if (nearest && nearest.distance < landRange(nearest.size)) s.beginDescent(nearest.name);
          } else if (s.sceneMode.type === 'descending') {
            s.abortDescent();
          }
          break;
        case 'h':
        case 'H':
          if (s.sceneMode.type === 'surface') s.beginAscent();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Tour mode: step through the planets while active.
  useEffect(() => {
    if (!tourActive) return;
    const { cycleFocus } = useStore.getState();
    cycleFocus(1); // jump to the first/next planet immediately
    const id = setInterval(() => useStore.getState().cycleFocus(1), TOUR_INTERVAL_MS);
    return () => clearInterval(id);
  }, [tourActive]);

  return null;
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './styles.css';

// Defense-in-depth against the native double-tap-to-zoom gesture (the CSS
// `touch-action: manipulation` on html/body/canvas/button is the primary
// guard; some mobile browsers still need this explicit fallback). A real
// double-tap-to-zoom lands twice in roughly the same spot; require that
// (not just "within 300ms") before suppressing. A purely time-based check
// used to swallow the click on ANY second tap anywhere on the page within
// 300ms of the previous one — e.g. tapping the Settings gear then quickly
// tapping a toggle inside it — because Settings' controls rely on the
// native `click`/`change` event, unlike the rest of the HUD (joystick,
// dig/scan/jump/place/deposit) which reads `onPointerDown` and was never
// affected. Scoping to same-location taps keeps the zoom guard while no
// longer blocking two unrelated fast taps in different places.
const DOUBLE_TAP_MAX_DISTANCE = 40; // px — real double-taps land in place
let lastTouchEnd = 0;
let lastTouchX = 0;
let lastTouchY = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = Date.now();
    const touch = e.changedTouches[0];
    const x = touch ? touch.clientX : lastTouchX;
    const y = touch ? touch.clientY : lastTouchY;
    const inPlace = Math.hypot(x - lastTouchX, y - lastTouchY) <= DOUBLE_TAP_MAX_DISTANCE;
    if (now - lastTouchEnd <= 300 && inPlace) e.preventDefault();
    lastTouchEnd = now;
    lastTouchX = x;
    lastTouchY = y;
  },
  { passive: false },
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

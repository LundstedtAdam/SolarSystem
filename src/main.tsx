import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './styles.css';

// Defense-in-depth against the native double-tap-to-zoom gesture (the CSS
// `touch-action: manipulation` on html/body/canvas/button is the primary
// guard; some mobile browsers still need this explicit fallback). Standard
// idiom: if a touchend follows the previous one within 300ms, treat it as a
// double-tap and suppress the browser's default handling. This never affects
// isolated single taps — every button in the game responds to onPointerDown
// (not the synthesized click), so this cannot block a legitimate game action;
// there is no double-tap game gesture (e.g. double-tap-to-sprint) to protect.
let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false },
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

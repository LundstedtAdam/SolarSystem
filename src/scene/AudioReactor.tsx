import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { audio } from '../audio/AudioManager';
import { useStore } from '../store';

const GAS_GIANTS = ['Jupiter', 'Saturnus', 'Uranus', 'Neptunus'];

/** Maps edge0→0, edge1→1 with smooth easing (handles descending ranges). */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Feeds camera proximity (to the sun / gas giants) to the drone each frame. */
export function AudioReactor() {
  const camera = useThree((s) => s.camera);
  const tmp = useRef(new Vector3());
  const frame = useRef(0);

  useFrame(() => {
    if (!audio.isStarted) return;
    if (frame.current++ % 6 !== 0) return; // throttle to ~10Hz

    const camPos = camera.position;
    let intensity = smoothstep(700, 120, camPos.length()); // near the sun
    const objs = useStore.getState().planetObjects;
    for (const name of GAS_GIANTS) {
      const o = objs[name];
      if (!o) continue;
      const d = o.getWorldPosition(tmp.current).distanceTo(camPos);
      intensity = Math.max(intensity, smoothstep(170, 35, d));
    }
    audio.setProximity(Math.min(1, intensity));
  });

  return null;
}

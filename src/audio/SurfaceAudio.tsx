import { useEffect } from 'react';
import { useStore } from '../store';
import { audio } from './AudioManager';
import { getSurfaceAudio } from './surfaceAudio';

/**
 * Drives the surface soundscape: fades wind/rumble in on landing, schedules
 * recurring environmental textures (ice cracks, lava gurgles, geyser hisses),
 * and fades everything out on launch. Renders nothing.
 */
export function SurfaceAudio() {
  const sceneMode = useStore((s) => s.sceneMode);

  const onSurface = sceneMode.type === 'surface';
  const planet = sceneMode.type === 'surface' ? sceneMode.planet : null;

  useEffect(() => {
    if (!onSurface || !planet) return;
    const profile = getSurfaceAudio(planet);
    audio.startSurface(profile);

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (profile.texture !== 'none') {
      // Irregular spacing so it never feels metronomic.
      const meanGap =
        profile.texture === 'volcanic' ? 2200 : profile.texture === 'ice' ? 4000 : 7000;
      const schedule = () => {
        audio.playSurfaceTexture(profile.texture as 'ice' | 'volcanic' | 'geyser');
        timer = setTimeout(schedule, meanGap * (0.5 + Math.random()));
      };
      timer = setTimeout(schedule, meanGap * (0.5 + Math.random()));
    }

    return () => {
      if (timer) clearTimeout(timer);
      audio.stopSurface();
    };
  }, [onSurface, planet]);

  return null;
}

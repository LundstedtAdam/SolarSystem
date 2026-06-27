import { useEffect } from 'react';
import { useStore } from '../store';
import { audio } from './AudioManager';
import { getSurfaceAudio } from './surfaceAudio';

/**
 * On-foot soundscape: reuses the per-body surface ambience (wind/rumble +
 * scheduled ice/lava/geyser textures) for the voxel world, and resets the cave
 * drone on exit. Footsteps and the live underground swell are driven per frame
 * by the PlayerController. Renders nothing.
 */
export function VoxelAudio() {
  const sceneMode = useStore((s) => s.sceneMode);
  const onVoxel = sceneMode.type === 'voxel';
  const planet = sceneMode.type === 'voxel' ? sceneMode.planet : null;

  useEffect(() => {
    if (!onVoxel || !planet) return;
    const profile = getSurfaceAudio(planet);
    audio.startSurface(profile);

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (profile.texture !== 'none') {
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
      audio.setCaveAmount(0);
      audio.stopSurface();
    };
  }, [onVoxel, planet]);

  return null;
}

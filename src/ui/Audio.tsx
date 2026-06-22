import { useEffect } from 'react';
import { useStore } from '../store';
import { audio } from '../audio/AudioManager';

/** Bridges the store to the audio engine and fires UI sfx. Renders nothing. */
export function Audio() {
  const volume = useStore((s) => s.volume);
  const muted = useStore((s) => s.muted);

  // Browsers block audio until a user gesture — start on the first one.
  useEffect(() => {
    const start = () => {
      audio.resume();
      const s = useStore.getState();
      audio.setMasterVolume(s.volume);
      audio.setMuted(s.muted);
    };
    window.addEventListener('pointerdown', start, { once: true });
    window.addEventListener('keydown', start, { once: true });
    return () => {
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
    };
  }, []);

  useEffect(() => {
    audio.setMasterVolume(volume);
  }, [volume]);
  useEffect(() => {
    audio.setMuted(muted);
  }, [muted]);

  // UI sound effects on relevant state changes.
  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        if (!audio.isStarted) return;
        if (s.focusObject !== prev.focusObject && s.focusObject) audio.playWhoosh();
        if (s.selected !== prev.selected && s.selected) audio.playSelect();
        if (s.paused !== prev.paused) audio.playToggle();
        if (s.showOrbits !== prev.showOrbits) audio.playToggle();
        if (s.tourActive !== prev.tourActive) audio.playToggle();
      }),
    []
  );

  return null;
}

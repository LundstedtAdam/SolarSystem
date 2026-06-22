import { useProgress } from '@react-three/drei';

/** Fullscreen overlay shown while scene textures are loading. */
export function Loading() {
  const { active } = useProgress();
  if (!active) return null;
  return <div className="loading">Laddar solsystemet...</div>;
}

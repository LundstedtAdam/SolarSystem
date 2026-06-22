import { useFrame } from '@react-three/fiber';
import { useStore } from '../store';

/** Sim days advanced per real second at speed = 1 (a cinematic time-scale). */
const DAYS_PER_SECOND = 6;

/** Advances simulation time unless paused. All motion derives from simTimeDays. */
export function SimClock() {
  useFrame((_, delta) => {
    const { paused, speed, advanceTime } = useStore.getState();
    if (!paused) advanceTime(delta * DAYS_PER_SECOND * speed);
  });
  return null;
}

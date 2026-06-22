import { useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import type { Mesh } from 'three';
import { type MoonData } from '../systems/bodies';
import { useStore } from '../store';
import { Atmosphere } from './Atmosphere';

const MOON_INCLINATION = Math.sin(0.1); // legacy constant tilt for all moons

/**
 * A moon orbiting inside its planet's (non-rotating) anchor group, so its
 * orbital plane is unaffected by the planet's own spin — matching the legacy
 * scene where moons were positioned relative to the parent's world position.
 */
export function Moon({ data }: { data: MoonData }) {
  const ref = useRef<Mesh>(null);
  const angle = useRef(data.initialAngle);
  const select = useStore((s) => s.select);

  const texture = useTexture(data.texture, (t) => {
    const tex = Array.isArray(t) ? t[0] : t;
    tex.anisotropy = 8;
  });

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const speed = useStore.getState().speed;
    angle.current += 0.02 * data.speed * speed;
    const r = data.distance;
    const theta = angle.current;
    mesh.position.set(r * Math.cos(theta), r * Math.sin(theta) * MOON_INCLINATION, r * Math.sin(theta));
    mesh.rotation.y += 0.01 * speed;
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    select(
      { name: data.name, size: data.size, distance: data.distance, speed: data.speed },
      e.object
    );
  };

  return (
    <mesh ref={ref} onClick={onClick}>
      <sphereGeometry args={[data.size, 32, 32]} />
      <meshStandardMaterial map={texture} roughness={0.95} metalness={0} />
      {data.atmosphere && (
        <Atmosphere radius={data.size * data.atmosphere.scale} data={data.atmosphere} />
      )}
    </mesh>
  );
}

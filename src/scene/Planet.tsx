import { useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import type { Group, Mesh } from 'three';
import { type PlanetData } from '../systems/bodies';
import { useStore } from '../store';
import { Moon } from './Moon';
import { SaturnRing } from './SaturnRing';

/**
 * A planet plus its moons. The `anchor` group carries the orbital position and
 * does NOT rotate, so moon orbits stay independent of the planet's spin (the
 * spinning `mesh` is a child of the anchor). Matches legacy behavior.
 */
export function Planet({ data }: { data: PlanetData }) {
  const anchor = useRef<Group>(null);
  const mesh = useRef<Mesh>(null);
  const angle = useRef(data.initialAngle);
  const select = useStore((s) => s.select);

  const texture = useTexture(data.texture, (t) => {
    const tex = Array.isArray(t) ? t[0] : t;
    tex.anisotropy = 8;
  });

  useFrame(() => {
    const a = anchor.current;
    const m = mesh.current;
    if (!a || !m) return;
    const speed = useStore.getState().speed;
    angle.current += 0.0005 * data.speed * speed;
    const theta = angle.current;
    const r =
      (data.distance * (1 - data.eccentricity * data.eccentricity)) /
      (1 + data.eccentricity * Math.cos(theta));
    a.position.set(r * Math.cos(theta), r * Math.sin(theta) * Math.sin(data.inclination), r * Math.sin(theta));
    m.rotation.y += 0.005 * speed;
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    select(
      { name: data.name, size: data.size, distance: data.distance, speed: data.speed },
      e.object
    );
  };

  return (
    <group ref={anchor}>
      <mesh ref={mesh} onClick={onClick}>
        <sphereGeometry args={[data.size, 64, 64]} />
        <meshPhongMaterial map={texture} specular={0x222222} shininess={10} />
        {data.hasRing && data.ringTexture && (
          <SaturnRing planetSize={data.size} texture={data.ringTexture} />
        )}
      </mesh>
      {data.moons.map((moon) => (
        <Moon key={moon.name} data={moon} />
      ))}
    </group>
  );
}

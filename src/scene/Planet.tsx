import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import type { Group, Mesh, Texture } from 'three';
import { type PlanetData } from '../systems/bodies';
import { useStore } from '../store';
import { Moon } from './Moon';
import { SaturnRing } from './SaturnRing';
import { Atmosphere } from './Atmosphere';
import { Clouds } from './Clouds';
import { createBodyMaterial } from './materials';

/**
 * A planet plus its moons, clouds, atmosphere and ring. The `anchor` group
 * carries the orbital position and does NOT rotate, so clouds/atmosphere/moons
 * stay independent of the planet's own spin (the spinning `mesh` is a child).
 */
export function Planet({ data }: { data: PlanetData }) {
  const anchor = useRef<Group>(null);
  const mesh = useRef<Mesh>(null);
  const angle = useRef(data.initialAngle);
  const select = useStore((s) => s.select);

  // Load the base map plus any Earth-specific maps for this body.
  const urls = useMemo(() => {
    const u: Record<string, string> = { map: data.texture };
    if (data.nightTexture) u.night = data.nightTexture;
    if (data.normalTexture) u.normal = data.normalTexture;
    if (data.specularTexture) u.specular = data.specularTexture;
    return u;
  }, [data]);

  const textures = useTexture(urls, (t) => {
    const tex = Array.isArray(t) ? t[0] : t;
    tex.anisotropy = 8;
  }) as Record<string, Texture>;

  const material = useMemo(
    () =>
      createBodyMaterial(data, {
        map: textures.map,
        night: textures.night,
        normal: textures.normal,
        specular: textures.specular,
      }),
    [data, textures]
  );

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
      <mesh ref={mesh} onClick={onClick} castShadow receiveShadow>
        <sphereGeometry args={[data.size, 64, 64]} />
        <primitive object={material} attach="material" />
        {data.hasRing && data.ringTexture && (
          <SaturnRing planetSize={data.size} texture={data.ringTexture} />
        )}
      </mesh>
      {data.bodyType === 'earth' && data.cloudsTexture && (
        <Clouds radius={data.size * 1.012} texture={data.cloudsTexture} />
      )}
      {data.atmosphere && <Atmosphere radius={data.size * data.atmosphere.scale} data={data.atmosphere} />}
      {data.moons.map((moon) => (
        <Moon key={moon.name} data={moon} />
      ))}
    </group>
  );
}

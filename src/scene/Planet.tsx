import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import type { Group, Mesh, Texture } from 'three';
import { type PlanetData } from '../systems/bodies';
import { positionAtTime, periodDays } from '../systems/ephemeris';
import { useStore } from '../store';
import { Moon } from './Moon';
import { SaturnRing } from './SaturnRing';
import { Atmosphere } from './Atmosphere';
import { Clouds } from './Clouds';
import { createBodyMaterial } from './materials';

const DEG = Math.PI / 180;

/**
 * A planet with its moons, clouds, atmosphere and ring.
 * - `anchor` carries the Keplerian orbital position (no spin/tilt).
 * - `tilt` applies the fixed axial obliquity (so the spin axis and the ring
 *   plane are correctly tilted, e.g. Uranus on its side, Saturn's rings at 27°).
 * - the inner mesh spins about its (tilted) axis.
 */
export function Planet({ data }: { data: PlanetData }) {
  const anchor = useRef<Group>(null);
  const mesh = useRef<Mesh>(null);
  const select = useStore((s) => s.select);

  // Visual spin rate (rad per sim-day), sign preserved for retrograde bodies.
  const spinVis = useMemo(
    () => Math.sign(data.rotationPeriodDays) * (0.08 / Math.sqrt(Math.abs(data.rotationPeriodDays))),
    [data.rotationPeriodDays]
  );

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
    const t = useStore.getState().simTimeDays;
    positionAtTime(data.elements, data.distance, t, a.position);
    m.rotation.y = t * spinVis;
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    select(
      {
        name: data.name,
        radiusKm: data.realRadiusKm,
        semiMajorAxisAU: data.elements.aAU,
        orbitalPeriodDays: periodDays(data.elements),
        rotationPeriodDays: data.rotationPeriodDays,
        axialTiltDeg: data.axialTiltDeg,
        eccentricity: data.elements.e,
      },
      e.object
    );
  };

  return (
    <group ref={anchor}>
      <group rotation={[0, 0, data.axialTiltDeg * DEG]}>
        <mesh ref={mesh} onClick={onClick} castShadow receiveShadow>
          <sphereGeometry args={[data.size, 64, 64]} />
          <primitive object={material} attach="material" />
        </mesh>
        {data.hasRing && data.ringTexture && (
          <SaturnRing planetSize={data.size} texture={data.ringTexture} />
        )}
        {data.bodyType === 'earth' && data.cloudsTexture && (
          <Clouds radius={data.size * 1.012} texture={data.cloudsTexture} />
        )}
      </group>
      {data.atmosphere && <Atmosphere radius={data.size * data.atmosphere.scale} data={data.atmosphere} />}
      {data.moons.map((moon) => (
        <Moon key={moon.name} data={moon} />
      ))}
    </group>
  );
}

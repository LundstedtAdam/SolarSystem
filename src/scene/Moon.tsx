import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import type { Mesh, Texture } from 'three';
import { type MoonData } from '../systems/bodies';
import { useStore } from '../store';
import { QUALITY } from '../systems/quality';
import { Atmosphere } from './Atmosphere';
import { createMoonMaterial } from './materials';

const MOON_INCLINATION = Math.sin(0.1); // gentle constant tilt for all moons

/**
 * A moon orbiting inside its planet's anchor group (so it tracks the planet's
 * orbital position). Orbit angle and spin derive from sim time; the angular
 * rate comes from the real (signed) orbital period — retrograde moons like
 * Triton orbit backwards. The rate is visually compressed, not 1:1 real-time.
 */
export function Moon({ data }: { data: MoonData }) {
  const ref = useRef<Mesh>(null);
  const select = useStore((s) => s.select);
  const quality = QUALITY[useStore((s) => s.quality)];
  const segments = data.terrain ? quality.terrainSegments : quality.moonSegments;

  // rad per sim-day, sign preserved for retrograde moons.
  const angularVis = useMemo(
    () => Math.sign(data.orbitalPeriodDays) * (0.15 / Math.sqrt(Math.abs(data.orbitalPeriodDays))),
    [data.orbitalPeriodDays]
  );

  // Use a record form so procedural moons (no map, e.g. Charon) skip loading.
  const textures = useTexture(data.texture ? { map: data.texture } : {}, (t) => {
    const tex = Array.isArray(t) ? t[0] : t;
    if (tex) tex.anisotropy = 8;
  }) as Record<string, Texture>;

  const material = useMemo(() => createMoonMaterial(data, textures.map), [data, textures]);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = useStore.getState().simTimeDays;
    const theta = data.initialAngle + t * angularVis;
    const r = data.distance;
    mesh.position.set(r * Math.cos(theta), r * Math.sin(theta) * MOON_INCLINATION, r * Math.sin(theta));
    mesh.rotation.y = theta; // tidally locked: same face toward the planet
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    select(
      {
        name: data.name,
        radiusKm: data.realRadiusKm,
        orbitalPeriodDays: data.orbitalPeriodDays,
        thumbnail: data.texture,
      },
      e.object
    );
  };

  return (
    <mesh ref={ref} onClick={onClick} castShadow receiveShadow>
      <sphereGeometry args={[data.size, segments, segments]} />
      <primitive object={material} attach="material" />
      {data.atmosphere && (
        <Atmosphere radius={data.size * data.atmosphere.scale} data={data.atmosphere} />
      )}
    </mesh>
  );
}

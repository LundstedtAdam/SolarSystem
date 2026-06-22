import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import type { Mesh } from 'three';
import { type MoonData } from '../systems/bodies';
import { useStore } from '../store';
import { Atmosphere } from './Atmosphere';

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

  // rad per sim-day, sign preserved for retrograde moons.
  const angularVis = useMemo(
    () => Math.sign(data.orbitalPeriodDays) * (0.15 / Math.sqrt(Math.abs(data.orbitalPeriodDays))),
    [data.orbitalPeriodDays]
  );

  const texture = useTexture(data.texture, (t) => {
    const tex = Array.isArray(t) ? t[0] : t;
    tex.anisotropy = 8;
  });

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
      { name: data.name, radiusKm: data.realRadiusKm, orbitalPeriodDays: data.orbitalPeriodDays },
      e.object
    );
  };

  return (
    <mesh ref={ref} onClick={onClick} castShadow receiveShadow>
      <sphereGeometry args={[data.size, 32, 32]} />
      <meshStandardMaterial map={texture} roughness={0.95} metalness={0} />
      {data.atmosphere && (
        <Atmosphere radius={data.size * data.atmosphere.scale} data={data.atmosphere} />
      )}
    </mesh>
  );
}

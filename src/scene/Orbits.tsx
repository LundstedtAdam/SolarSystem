import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { Vector3 } from 'three';
import { PLANETS, type PlanetData } from '../systems/bodies';
import { useStore } from '../store';

const SEGMENTS = 100;

function orbitPoints(p: PlanetData): Vector3[] {
  const pts: Vector3[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const theta = (i / SEGMENTS) * Math.PI * 2;
    const r = (p.distance * (1 - p.eccentricity * p.eccentricity)) / (1 + p.eccentricity * Math.cos(theta));
    const x = r * Math.cos(theta);
    const z = r * Math.sin(theta);
    const y = r * Math.sin(theta) * Math.sin(p.inclination);
    pts.push(new Vector3(x, y, z));
  }
  return pts;
}

/** Faint elliptical orbit lines, one per planet (toggleable). */
export function Orbits() {
  const showOrbits = useStore((s) => s.showOrbits);
  const lines = useMemo(() => PLANETS.map((p) => ({ name: p.name, points: orbitPoints(p) })), []);

  return (
    <group visible={showOrbits}>
      {lines.map((l) => (
        <Line key={l.name} points={l.points} color={0xffffff} transparent opacity={0.3} lineWidth={1} />
      ))}
    </group>
  );
}

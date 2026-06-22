import { useMemo } from 'react';
import { BufferGeometry, Line, LineBasicMaterial, Vector3 } from 'three/webgpu';
import { PLANETS, type PlanetData } from '../systems/bodies';
import { useStore } from '../store';

const SEGMENTS = 100;

function orbitPoints(p: PlanetData): Vector3[] {
  const pts: Vector3[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const theta = (i / SEGMENTS) * Math.PI * 2;
    const r =
      (p.distance * (1 - p.eccentricity * p.eccentricity)) /
      (1 + p.eccentricity * Math.cos(theta));
    const x = r * Math.cos(theta);
    const z = r * Math.sin(theta);
    const y = r * Math.sin(theta) * Math.sin(p.inclination);
    pts.push(new Vector3(x, y, z));
  }
  return pts;
}

/**
 * Faint elliptical orbit lines, one per planet (toggleable). Plain THREE.Line +
 * LineBasicMaterial (auto-converted by the WebGPU node renderer); drei's fat
 * <Line> uses a shader material the WebGPU backend can't consume.
 */
export function Orbits() {
  const showOrbits = useStore((s) => s.showOrbits);

  const lines = useMemo(
    () =>
      PLANETS.map((p) => {
        const geometry = new BufferGeometry().setFromPoints(orbitPoints(p));
        const material = new LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.25,
        });
        return new Line(geometry, material);
      }),
    []
  );

  return (
    <group visible={showOrbits}>
      {lines.map((line, i) => (
        <primitive key={i} object={line} />
      ))}
    </group>
  );
}

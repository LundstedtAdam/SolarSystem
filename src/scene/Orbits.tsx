import { useMemo } from 'react';
import { BufferGeometry, Line, LineBasicMaterial } from 'three/webgpu';
import { PLANETS } from '../systems/bodies';
import { orbitCurve } from '../systems/ephemeris';
import { useStore } from '../store';

/**
 * Faint orbit lines, one per planet, built from the real orbital elements
 * (eccentricity, inclination, node, perihelion) at the cinematic render scale.
 */
export function Orbits() {
  const showOrbits = useStore((s) => s.showOrbits);

  const lines = useMemo(
    () =>
      PLANETS.map((p) => {
        const geometry = new BufferGeometry().setFromPoints(orbitCurve(p.elements, p.distance));
        const material = new LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.22,
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

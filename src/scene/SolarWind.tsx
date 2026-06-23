import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferGeometry,
  BufferAttribute,
  Points,
  PointsMaterial,
  AdditiveBlending,
  Color,
  type Material,
} from 'three/webgpu';
import { useStore } from '../store';
import { QUALITY } from '../systems/quality';

const START = 24; // just outside the sun
const END = 520; // past Neptune's orbit

/**
 * Solar wind: additive points streaming radially outward from the sun and
 * recycling. Foundation for asteroid dust / comet tails in later phases.
 */
export function SolarWind() {
  const count = QUALITY[useStore((s) => s.quality)].solarWind;
  const { points, dirs, offs, speeds } = useMemo(() => {
    const dirs = new Float32Array(count * 3);
    const offs = new Float32Array(count);
    const speeds = new Float32Array(count);
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Random unit direction.
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const dx = Math.sin(phi) * Math.cos(theta);
      const dy = Math.sin(phi) * Math.sin(theta);
      const dz = Math.cos(phi);
      dirs[i * 3] = dx;
      dirs[i * 3 + 1] = dy;
      dirs[i * 3 + 2] = dz;
      offs[i] = Math.random() * (END - START);
      speeds[i] = 30 + Math.random() * 60;
      const r = START + offs[i];
      positions[i * 3] = dx * r;
      positions[i * 3 + 1] = dy * r;
      positions[i * 3 + 2] = dz * r;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    const material = new PointsMaterial({
      size: 2.6,
      sizeAttenuation: true,
      color: new Color(1.0, 0.85, 0.6),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    return { points: new Points(geometry, material), dirs, offs, speeds };
  }, [count]);

  // Free GPU resources when the point cloud is rebuilt (quality change) / unmount.
  useEffect(() => {
    return () => {
      points.geometry.dispose();
      (points.material as Material).dispose();
    };
  }, [points]);

  const elapsed = useRef(0);

  useFrame((_, delta) => {
    if (useStore.getState().paused) return;
    elapsed.current += delta * useStore.getState().speed;
    const span = END - START;
    const pos = points.geometry.attributes.position as BufferAttribute;
    const arr = pos.array as Float32Array;
    const t = elapsed.current;
    for (let i = 0; i < offs.length; i++) {
      const r = START + ((offs[i] + t * speeds[i]) % span);
      arr[i * 3] = dirs[i * 3] * r;
      arr[i * 3 + 1] = dirs[i * 3 + 1] * r;
      arr[i * 3 + 2] = dirs[i * 3 + 2] * r;
    }
    pos.needsUpdate = true;
  });

  return <primitive object={points} />;
}

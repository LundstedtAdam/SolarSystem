import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BufferGeometry,
  BufferAttribute,
  Points,
  PointsMaterial,
  AdditiveBlending,
  NormalBlending,
  Color,
  type Material,
} from 'three/webgpu';
import { useStore } from '../store';
import { QUALITY } from '../systems/quality';
import { getWeather } from './weatherProfiles';

// Particles live in a box centred on the camera; each frame they fall + drift
// and wrap within the box, so a modest count fills the visible area. The whole
// cloud follows the camera, so weather is always around the player.
const BOX = 70; // box edge (voxels)
const HALF = BOX / 2;

export function VoxelWeather({ planet }: { planet: string }) {
  const camera = useThree((s) => s.camera);
  const budget = QUALITY[useStore((s) => s.quality)].voxelParticles;
  const profile = useMemo(() => getWeather(planet), [planet]);
  const count = Math.max(0, Math.round(budget * profile.density));

  const points = useMemo(() => {
    if (count === 0 || profile.kind === 'none') return null;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * BOX;
      positions[i * 3 + 1] = (Math.random() - 0.5) * BOX;
      positions[i * 3 + 2] = (Math.random() - 0.5) * BOX;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    const material = new PointsMaterial({
      size: profile.size,
      sizeAttenuation: true,
      color: new Color(...profile.color),
      transparent: true,
      opacity: profile.additive ? 0.6 : 0.5,
      depthWrite: false,
      blending: profile.additive ? AdditiveBlending : NormalBlending,
    });
    return new Points(geometry, material);
  }, [count, profile]);

  useEffect(() => {
    if (!points) return;
    points.frustumCulled = false;
    return () => {
      points.geometry.dispose();
      (points.material as Material).dispose();
    };
  }, [points]);

  useFrame((_, dt) => {
    if (!points || useStore.getState().sceneMode.type !== 'voxel') return;
    const d = Math.min(dt, 0.05);
    points.position.copy(camera.position);
    const arr = (points.geometry.attributes.position as BufferAttribute).array as Float32Array;
    for (let i = 0; i < count; i++) {
      let y = arr[i * 3 + 1] - profile.fall * d;
      let x = arr[i * 3] + profile.drift * d;
      // Wrap within the local box (relative to the camera-centred origin).
      if (y < -HALF) y += BOX;
      else if (y > HALF) y -= BOX;
      if (x < -HALF) x += BOX;
      else if (x > HALF) x -= BOX;
      arr[i * 3] = x;
      arr[i * 3 + 1] = y;
    }
    (points.geometry.attributes.position as BufferAttribute).needsUpdate = true;
  });

  if (!points) return null;
  return <primitive object={points} />;
}

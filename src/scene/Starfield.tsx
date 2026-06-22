import { useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import {
  RepeatWrapping,
  BackSide,
  AdditiveBlending,
  BufferGeometry,
  BufferAttribute,
  Points,
  PointsMaterial,
} from 'three/webgpu';
import { TEXTURES } from '../systems/bodies';

const STAR_COUNT = 2500;

/** A field of additive points distributed on a thick shell, for parallax depth. */
function makeStars(): Points {
  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    // Random direction on a sphere, radius in a far shell (inside the skybox,
    // well outside the planets).
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = 3000 + Math.random() * 7000;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
    // Subtle blue/white/amber temperature variation.
    const t = Math.random();
    const tint = 0.75 + Math.random() * 0.25;
    colors[i * 3] = (t < 0.5 ? 1.0 : 0.8) * tint;
    colors[i * 3 + 1] = tint;
    colors[i * 3 + 2] = (t < 0.5 ? 0.85 : 1.0) * tint;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  const material = new PointsMaterial({
    size: 6,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  return new Points(geometry, material);
}

/** Legacy texture skybox plus a procedural additive star layer for depth. */
export function Starfield() {
  const texture = useTexture(TEXTURES.stars, (t) => {
    const tex = Array.isArray(t) ? t[0] : t;
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    tex.repeat.set(2, 2);
  });

  const stars = useMemo(() => makeStars(), []);

  return (
    <group>
      <mesh>
        <sphereGeometry args={[15000, 64, 64]} />
        <meshBasicMaterial map={texture} side={BackSide} fog={false} />
      </mesh>
      <primitive object={stars} />
    </group>
  );
}

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { MeshStandardNodeMaterial, type Mesh } from 'three/webgpu';
import { texture as textureNode, vec3, float } from 'three/tsl';
import { useStore } from '../store';

/**
 * Earth's cloud layer: a slightly larger sphere with the cloud map driving
 * opacity (white clouds, transparent gaps), lit by the sun and drifting
 * slightly faster than the surface.
 */
export function Clouds({ radius, texture: url }: { radius: number; texture: string }) {
  const ref = useRef<Mesh>(null);
  const map = useTexture(url, (t) => {
    const tex = Array.isArray(t) ? t[0] : t;
    tex.anisotropy = 8;
  });

  const material = useMemo(() => {
    const m = new MeshStandardNodeMaterial();
    const clouds = textureNode(map);
    m.colorNode = vec3(1, 1, 1);
    m.opacityNode = clouds.r; // white = opaque cloud, black = clear sky
    m.metalnessNode = float(0);
    m.roughnessNode = float(1);
    m.transparent = true;
    m.depthWrite = false;
    return m;
  }, [map]);

  useFrame(() => {
    if (ref.current) ref.current.rotation.y += 0.0006 * useStore.getState().speed;
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[radius, 64, 64]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

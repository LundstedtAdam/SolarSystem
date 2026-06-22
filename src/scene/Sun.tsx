import { useTexture } from '@react-three/drei';
import { TEXTURES } from '../systems/bodies';

/**
 * Sun: unlit textured sphere with a point light inside. decay={0} reproduces
 * the legacy (non-physical) falloff so the planets read as brightly lit as in
 * the original build. Phase 1 replaces this with physically-based lighting.
 */
export function Sun() {
  const texture = useTexture(TEXTURES.sun);

  return (
    <mesh name="Sun">
      <sphereGeometry args={[20, 64, 64]} />
      <meshBasicMaterial map={texture} />
      <pointLight color={0xffffff} intensity={2.5} distance={2000} decay={0} />
    </mesh>
  );
}

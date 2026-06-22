import { useTexture } from '@react-three/drei';
import { RepeatWrapping, BackSide } from 'three';
import { TEXTURES } from '../systems/bodies';

/** Legacy starfield: a single texture on the inside of a huge sphere. */
export function Starfield() {
  const texture = useTexture(TEXTURES.stars, (t) => {
    const tex = Array.isArray(t) ? t[0] : t;
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    tex.repeat.set(2, 2);
  });

  return (
    <mesh>
      <sphereGeometry args={[15000, 64, 64]} />
      <meshBasicMaterial map={texture} side={BackSide} fog={false} />
    </mesh>
  );
}

import { useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import { MeshBasicNodeMaterial, AdditiveBlending } from 'three/webgpu';
import {
  texture as textureNode,
  vec3,
  float,
  normalWorld,
  positionWorld,
  cameraPosition,
} from 'three/tsl';
import { TEXTURES } from '../systems/bodies';

/**
 * Sun: an HDR-bright textured sphere (values >1 so the bloom pass makes it
 * glow) wrapped in a Fresnel "corona" shell that adds a warm rim halo.
 */
export function Sun() {
  const map = useTexture(TEXTURES.sun);

  const sunMat = useMemo(() => {
    const m = new MeshBasicNodeMaterial();
    // Warm HDR multiplier pushes the sun above 1.0 so bloom catches it.
    m.colorNode = textureNode(map).mul(vec3(3.2, 2.7, 2.1));
    return m;
  }, [map]);

  const coronaMat = useMemo(() => {
    const m = new MeshBasicNodeMaterial();
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const fresnel = float(1).sub(normalWorld.normalize().dot(viewDir).max(0));
    m.colorNode = vec3(1.0, 0.6, 0.25).mul(2.0);
    m.opacityNode = fresnel.pow(2.5);
    m.transparent = true;
    m.depthWrite = false;
    m.blending = AdditiveBlending;
    return m;
  }, []);

  return (
    <group>
      <mesh name="Sun">
        <sphereGeometry args={[20, 64, 64]} />
        <primitive object={sunMat} attach="material" />
        {/* Single key light; decay 0 keeps compressed-scale outer planets lit. */}
        <pointLight color={0xfff4e6} intensity={3} distance={0} decay={0} />
      </mesh>
      <mesh scale={1.7}>
        <sphereGeometry args={[20, 48, 48]} />
        <primitive object={coronaMat} attach="material" />
      </mesh>
    </group>
  );
}

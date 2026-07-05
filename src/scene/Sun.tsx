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
import { TEXTURES, WORLD_SCALE } from '../systems/bodies';
import { QUALITY } from '../systems/quality';
import { useStore } from '../store';

// Sun render radius, scaled with the rest of the body layout.
const SUN_RADIUS = 20 * WORLD_SCALE;

/**
 * Sun: an HDR-bright textured sphere (values >1 so the bloom pass makes it
 * glow) wrapped in a Fresnel "corona" shell that adds a warm rim halo.
 */
export function Sun() {
  const map = useTexture(TEXTURES.sun);
  const q = QUALITY[useStore((s) => s.quality)];

  const sunMat = useMemo(() => {
    const m = new MeshBasicNodeMaterial();
    // Warm-white HDR (matches the 0xfff2e0/0xfff8f0 sunlight convention used
    // elsewhere), not a heavily orange-skewed one — the previous extreme,
    // unevenly-scaled multiplier (3.5/2.8/2.0) pushed ACES filmic tonemapping
    // into its known hue-shift-toward-green artifact once bloom picked it up.
    m.colorNode = textureNode(map).mul(vec3(1.0, 0.95, 0.85)).mul(2.0);
    return m;
  }, [map]);

  const coronaMat = useMemo(() => {
    const m = new MeshBasicNodeMaterial();
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const fresnel = float(1).sub(normalWorld.normalize().dot(viewDir).max(0));
    // Two-layer corona: warm inner rim + cooler outer halo. The inner ring's
    // color/magnitude are kept close to the sun core's own tuned values
    // (peak ~1.6-2.0x, a less extreme ratio spread) — the previous, more
    // extreme values (2.4x at a 1:0.55:0.2 ratio) were a second, previously
    // unfixed source of the ACES hue-shift-toward-green artifact under bloom.
    const inner = fresnel.pow(2.0).mul(vec3(1.0, 0.8, 0.6)).mul(1.6);
    const outer = fresnel.pow(4.5).mul(vec3(1.0, 0.8, 0.5)).mul(0.6);
    m.colorNode = inner.add(outer);
    m.opacityNode = fresnel.pow(1.8);
    m.transparent = true;
    m.depthWrite = false;
    m.blending = AdditiveBlending;
    return m;
  }, []);

  return (
    <group>
      <mesh name="Sun">
        <sphereGeometry args={[SUN_RADIUS, 64, 64]} />
        <primitive object={sunMat} attach="material" />
        {/* Single key light; decay 0 keeps compressed-scale outer planets lit.
            Casts shadows (ring on Saturn, planets on moons). */}
        <pointLight
          color={0xfff2e0}
          intensity={3.2}
          distance={0}
          decay={0}
          castShadow={q.shadows}
          shadow-mapSize-width={q.shadowMapSize}
          shadow-mapSize-height={q.shadowMapSize}
          shadow-camera-near={0.5}
          shadow-camera-far={3000 * WORLD_SCALE}
          shadow-bias={-0.0003}
          shadow-normalBias={0.45}
        />
      </mesh>
      <mesh scale={1.85}>
        <sphereGeometry args={[SUN_RADIUS, 48, 48]} />
        <primitive object={coronaMat} attach="material" />
      </mesh>
    </group>
  );
}

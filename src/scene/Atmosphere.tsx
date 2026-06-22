import { useMemo } from 'react';
import { MeshBasicNodeMaterial, AdditiveBlending, Color } from 'three/webgpu';
import { vec3, float, normalWorld, positionWorld, cameraPosition } from 'three/tsl';
import type { Atmosphere as AtmosphereData } from '../systems/bodies';

/**
 * Additive Fresnel shell that glows at the limb — a cheap, convincing
 * atmosphere/haze. Sized slightly larger than the body it wraps.
 */
export function Atmosphere({ radius, data }: { radius: number; data: AtmosphereData }) {
  const material = useMemo(() => {
    const m = new MeshBasicNodeMaterial();
    const c = new Color(data.color);
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const fresnel = float(1).sub(normalWorld.normalize().dot(viewDir).max(0));
    m.colorNode = vec3(c.r, c.g, c.b);
    m.opacityNode = fresnel.pow(3.0).mul(data.intensity);
    m.transparent = true;
    m.depthWrite = false;
    m.blending = AdditiveBlending;
    return m;
  }, [data]);

  return (
    <mesh>
      <sphereGeometry args={[radius, 48, 48]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

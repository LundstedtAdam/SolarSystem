import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { RingGeometry, DoubleSide, Vector3, type Group } from 'three';

interface Props {
  /** Planet radius; ring spans 1.2x–2x this, matching the legacy build. */
  planetSize: number;
  texture: string;
}

/** Saturn's ring: UV-remapped ring geometry with a subtle z-axis wobble. */
export function SaturnRing({ planetSize, texture }: Props) {
  const container = useRef<Group>(null);
  const innerRadius = planetSize * 1.2;
  const outerRadius = planetSize * 2;

  const map = useTexture(texture, (t) => {
    const tex = Array.isArray(t) ? t[0] : t;
    tex.flipY = false;
  });

  const geometry = useMemo(() => {
    const geo = new RingGeometry(innerRadius, outerRadius, 64);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const v3 = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      v3.fromBufferAttribute(pos, i);
      const u = (v3.length() - innerRadius) / (outerRadius - innerRadius);
      const v = Math.atan2(v3.y, v3.x) / (2 * Math.PI) + 0.5;
      uv.setXY(i, u, v);
    }
    return geo;
  }, [innerRadius, outerRadius]);

  useFrame(() => {
    if (container.current) {
      container.current.rotation.z = Math.sin(Date.now() * 0.0001) * 0.1;
    }
  });

  return (
    <group ref={container} rotation={[-Math.PI / 2, Math.PI / 6, 0]}>
      <mesh geometry={geometry}>
        <meshBasicMaterial map={map} side={DoubleSide} transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

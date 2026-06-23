import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { ConeGeometry, MeshStandardMaterial, type Mesh, Color } from 'three';

export function ShipModel() {
  const meshRef = useRef<Mesh>(null);
  const glowRef = useRef<Mesh>(null);

  const geometry = useMemo(() => {
    const geo = new ConeGeometry(0.6, 2.4, 6);
    geo.rotateX(Math.PI / 2);
    return geo;
  }, []);

  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color: 0xcccccc,
        metalness: 0.7,
        roughness: 0.3,
      }),
    [],
  );

  const glowMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: new Color(2, 0.8, 0.2),
        emissive: new Color(2, 0.8, 0.2),
        emissiveIntensity: 2,
        transparent: true,
        opacity: 0.8,
      }),
    [],
  );

  const glowGeometry = useMemo(() => {
    const geo = new ConeGeometry(0.3, 0.8, 6);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, 1.4);
    return geo;
  }, []);

  useFrame(() => {
    if (glowRef.current) {
      const scale = 0.8 + Math.random() * 0.4;
      glowRef.current.scale.set(scale, scale, scale);
    }
  });

  return (
    <group>
      <mesh ref={meshRef} geometry={geometry} material={material} castShadow />
      <mesh ref={glowRef} geometry={glowGeometry} material={glowMaterial} />
    </group>
  );
}

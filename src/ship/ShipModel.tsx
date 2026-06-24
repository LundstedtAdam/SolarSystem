import { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  ConeGeometry,
  MeshStandardMaterial,
  type Mesh,
  type Group,
  Color,
  AdditiveBlending,
} from 'three';
import { useGLTF } from '@react-three/drei';

const GLTF_PATH = '/models/spaceship.glb';
const THRUSTER_NAMES = ['thruster', 'engine', 'exhaust', 'nozzle', 'jet'];

function isThrusterMaterial(name: string): boolean {
  const n = name.toLowerCase();
  return THRUSTER_NAMES.some((t) => n.includes(t));
}

function FallbackShip() {
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
        color: new Color(0.4, 0.6, 2.0),
        emissive: new Color(0.4, 0.6, 2.0),
        emissiveIntensity: 1.5,
        transparent: true,
        opacity: 0.7,
        blending: AdditiveBlending,
        depthWrite: false,
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

function GLTFShip() {
  const { scene } = useGLTF(GLTF_PATH);
  const groupRef = useRef<Group>(null);
  const thrusterMeshes = useRef<Mesh[]>([]);

  const cloned = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if ((child as Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return clone;
  }, [scene]);

  useEffect(() => {
    thrusterMeshes.current = [];
    cloned.traverse((child) => {
      if (!(child as Mesh).isMesh) return;
      const mesh = child as Mesh;
      const matName = Array.isArray(mesh.material)
        ? mesh.material[0]?.name ?? ''
        : mesh.material?.name ?? '';
      const meshName = mesh.name.toLowerCase();
      if (isThrusterMaterial(matName) || isThrusterMaterial(meshName)) {
        thrusterMeshes.current.push(mesh);
        const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as MeshStandardMaterial;
        if (mat && 'emissive' in mat) {
          mat.emissive = new Color(0.3, 0.5, 1.8);
          mat.emissiveIntensity = 1.2;
        }
      }
    });
  }, [cloned]);

  useFrame(() => {
    for (const mesh of thrusterMeshes.current) {
      const flicker = 0.9 + Math.random() * 0.2;
      const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as MeshStandardMaterial;
      if (mat && 'emissiveIntensity' in mat) {
        mat.emissiveIntensity = 1.2 * flicker;
      }
    }
  });

  return (
    <group ref={groupRef} scale={0.5} rotation={[0, Math.PI, 0]}>
      <primitive object={cloned} />
    </group>
  );
}

let gltfAvailable: boolean | null = null;

export function ShipModel() {
  const [useGltf, setUseGltf] = useState(gltfAvailable ?? true);

  useEffect(() => {
    if (gltfAvailable !== null) {
      setUseGltf(gltfAvailable);
      return;
    }
    fetch(GLTF_PATH, { method: 'HEAD' })
      .then((r) => {
        gltfAvailable = r.ok;
        setUseGltf(r.ok);
      })
      .catch(() => {
        gltfAvailable = false;
        setUseGltf(false);
      });
  }, []);

  if (useGltf) {
    return <GLTFShip />;
  }
  return <FallbackShip />;
}

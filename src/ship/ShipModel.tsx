import { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  ConeGeometry,
  MeshStandardMaterial,
  Box3,
  Vector3,
  type Mesh,
  type Group,
  Color,
  AdditiveBlending,
} from 'three';
import { useGLTF } from '@react-three/drei';

const GLTF_PATH = '/models/spaceship.glb';
const THRUSTER_NAMES = ['thruster', 'engine', 'exhaust', 'nozzle', 'jet'];

// Longest dimension the ship should occupy in render units. The raw GLB is
// ~24 units long (planet-sized). Planets render at radius 2-28, so the ship
// must be a fraction of that to read as a tiny craft dwarfed by the bodies it
// flies between. The chase/surface cameras sit proportionally close.
const TARGET_LENGTH = 1.2;

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

  // Clone, normalize size, recenter, and fix materials. The raw GLB ships every
  // material with emissiveFactor [1,1,1] driving an emissive texture, so the
  // entire hull glows (the green cast) and bloom amplifies it. We zero emissive
  // on everything except the real thrusters.
  const { cloned, fitScale } = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if ((child as Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    // Normalize to a fixed length and recenter on the origin so the ship sits
    // correctly wherever it is placed.
    const box = new Box3().setFromObject(clone);
    const size = box.getSize(new Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = TARGET_LENGTH / maxDim;
    const center = box.getCenter(new Vector3());
    clone.position.sub(center);

    return { cloned: clone, fitScale: scale };
  }, [scene]);

  useEffect(() => {
    thrusterMeshes.current = [];
    cloned.traverse((child) => {
      if (!(child as Mesh).isMesh) return;
      const mesh = child as Mesh;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const matName = mats[0]?.name ?? '';
      const meshName = mesh.name.toLowerCase();
      const isThruster = isThrusterMaterial(matName) || isThrusterMaterial(meshName);

      for (const m of mats) {
        const mat = m as MeshStandardMaterial;
        if (!mat || !('emissive' in mat)) continue;
        if (isThruster) {
          mat.emissive = new Color(0.3, 0.5, 1.8);
          mat.emissiveIntensity = 1.2;
        } else {
          // Kill the full-white hull glow that produced the green cast.
          mat.emissive = new Color(0, 0, 0);
          mat.emissiveIntensity = 0;
        }
      }
      if (isThruster) thrusterMeshes.current.push(mesh);
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
    <group ref={groupRef} scale={fitScale} rotation={[0, Math.PI, 0]}>
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

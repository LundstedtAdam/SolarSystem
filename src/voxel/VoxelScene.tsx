import { useMemo, useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import {
  Color,
  InstancedMesh,
  BoxGeometry,
  MeshStandardMaterial,
  Object3D,
  Vector3,
  type PerspectiveCamera,
} from 'three';
import { useStore } from '../store';
import { getBiome } from '../terrain/biomes';

// Placeholder voxel world for sub-phase 9.0: a flat grid of cubes lit by the
// body's biome so disembarking lands in a recognisably "voxel" version of the
// same surface. The real chunked engine (worldgen + greedy mesher) replaces the
// ground in 9.1; sky/material/AAA look land in 9.2.
const GRID = 32; // cubes per side
const CUBE = 2; // world units per voxel

/** Deterministic 0..1 hash so the placeholder relief is stable per cell. */
function hash2(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function VoxelGround({ planet, origin }: { planet: string; origin: Vector3 }) {
  const biome = useMemo(() => getBiome(planet), [planet]);

  const { geometry, material } = useMemo(() => {
    const geometry = new BoxGeometry(CUBE, CUBE, CUBE);
    const material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: biome.roughnessHigh,
      metalness: 0,
    });
    return { geometry, material };
  }, [biome]);

  const mesh = useMemo(
    () => new InstancedMesh(geometry, material, GRID * GRID),
    [geometry, material],
  );

  useEffect(() => {
    const dummy = new Object3D();
    const low = new Color(...biome.colorLow);
    const mid = new Color(...biome.colorMid);
    const high = new Color(...biome.colorHigh);
    const c = new Color();
    let i = 0;
    for (let gx = 0; gx < GRID; gx++) {
      for (let gz = 0; gz < GRID; gz++) {
        const wx = origin.x + (gx - GRID / 2) * CUBE;
        const wz = origin.z + (gz - GRID / 2) * CUBE;
        const h = hash2(gx, gz);
        const lift = Math.floor(h * 3) * CUBE; // 0..2 blocks of relief
        // Cube centre sits one block below ground so its top aligns to y=origin.y.
        dummy.position.set(wx, origin.y - CUBE / 2 + lift, wz);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        // Blend the biome palette by relief height for a hint of variation.
        c.copy(low).lerp(mid, Math.min(h * 1.5, 1)).lerp(high, lift / (CUBE * 2));
        mesh.setColorAt(i, c);
        i++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [mesh, biome, origin]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
    mesh.dispose();
  }, [geometry, material, mesh]);

  return <primitive object={mesh} />;
}

/** First-person placeholder camera: stands at the ship and looks out over the grid. */
function VoxelCamera({ origin }: { origin: Vector3 }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const initialized = useRef(false);
  const _look = useMemo(() => new Vector3(), []);

  useEffect(() => {
    camera.near = 0.1;
    camera.far = 2000;
    camera.fov = 75;
    camera.updateProjectionMatrix();
    initialized.current = false;
  }, [camera]);

  useFrame(() => {
    if (useStore.getState().sceneMode.type !== 'voxel') return;
    if (!initialized.current) {
      camera.position.set(origin.x, origin.y + 1.7, origin.z);
      initialized.current = true;
    }
    _look.set(origin.x, origin.y + 1.4, origin.z + 10);
    camera.lookAt(_look);
  });

  return null;
}

export function VoxelScene() {
  const sceneMode = useStore((s) => s.sceneMode);
  const planet = sceneMode.type === 'voxel' ? sceneMode.planet : '';
  const [px, py, pz] = useStore((s) => s.shipPosition);
  const scene = useThree((s) => s.scene);

  const origin = useMemo(() => new Vector3(px, py, pz), [px, py, pz]);

  const { ambientColor, ambientIntensity, sunIntensity, horizon } = useMemo(() => {
    const b = getBiome(planet);
    return {
      ambientColor: new Color(...b.ambientColor),
      ambientIntensity: b.ambientIntensity,
      sunIntensity: b.sunIntensity,
      horizon: new Color(...b.skyHorizon),
    };
  }, [planet]);

  // Voxel mode owns the scene backdrop; restore it on exit so space view is clean.
  useEffect(() => {
    const prev = scene.background;
    scene.background = horizon;
    return () => {
      scene.background = prev;
    };
  }, [scene, horizon]);

  if (sceneMode.type !== 'voxel') return null;

  return (
    <>
      <VoxelGround planet={planet} origin={origin} />
      <ambientLight intensity={ambientIntensity} color={ambientColor} />
      <directionalLight position={[120, 220, 160]} intensity={sunIntensity} color={0xfff8f0} />
      <VoxelCamera origin={origin} />
    </>
  );
}

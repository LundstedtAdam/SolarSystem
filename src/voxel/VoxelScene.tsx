import { useMemo, useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Color, Euler, Vector3, type PerspectiveCamera } from 'three';
import { useStore } from '../store';
import { getBiome } from '../terrain/biomes';
import { ChunkManager } from './ChunkManager';
import { voxelSpawn } from './worldGen';

// Sub-phase 9.1: the voxel world is a streamed chunk field at the world origin
// (kept near 0 to avoid float precision loss far from the ship). Lighting and
// backdrop come from the shared biome so it reads as the same body. A debug
// fly camera (left-drag look + WASD) exercises streaming until the real
// first-person controller and mobile touch input land in 9.3.

/** Temporary keyboard/drag fly camera for verifying chunk streaming on desktop. */
function DebugFlyCamera({ planet }: { planet: string }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const keys = useRef<Record<string, boolean>>({});
  const yaw = useRef(0);
  const pitch = useRef(0);
  const pos = useRef(new Vector3());
  const dragging = useRef(false);
  const ready = useRef(false);
  const euler = useMemo(() => new Euler(0, 0, 0, 'YXZ'), []);
  const forward = useMemo(() => new Vector3(), []);
  const right = useMemo(() => new Vector3(), []);

  useEffect(() => {
    camera.near = 0.1;
    camera.far = 2000;
    camera.fov = 75;
    camera.updateProjectionMatrix();
    ready.current = false;
  }, [camera, planet]);

  useEffect(() => {
    const dom = gl.domElement;
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      keys.current[e.code] = down;
    };
    const kd = onKey(true);
    const ku = onKey(false);
    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 0) dragging.current = true;
    };
    const onPointerUp = () => {
      dragging.current = false;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      yaw.current -= e.movementX * 0.0025;
      pitch.current -= e.movementY * 0.0025;
      const lim = Math.PI / 2 - 0.05;
      pitch.current = Math.max(-lim, Math.min(lim, pitch.current));
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointermove', onPointerMove);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, [gl]);

  useFrame((_, dt) => {
    if (useStore.getState().sceneMode.type !== 'voxel') return;
    if (!ready.current) {
      pos.current.copy(voxelSpawn(planet));
      yaw.current = 0;
      pitch.current = 0;
      ready.current = true;
    }
    euler.set(pitch.current, yaw.current, 0);
    camera.quaternion.setFromEuler(euler);

    forward.set(0, 0, -1).applyEuler(euler);
    forward.y = 0;
    forward.normalize();
    right.set(1, 0, 0).applyEuler(euler);
    right.y = 0;
    right.normalize();

    const speed = (keys.current['ShiftLeft'] ? 48 : 20) * Math.min(dt, 0.05);
    const k = keys.current;
    if (k['KeyW']) pos.current.addScaledVector(forward, speed);
    if (k['KeyS']) pos.current.addScaledVector(forward, -speed);
    if (k['KeyD']) pos.current.addScaledVector(right, speed);
    if (k['KeyA']) pos.current.addScaledVector(right, -speed);
    if (k['Space']) pos.current.y += speed;
    if (k['ControlLeft']) pos.current.y -= speed;

    camera.position.copy(pos.current);
  });

  return null;
}

export function VoxelScene() {
  const sceneMode = useStore((s) => s.sceneMode);
  const planet = sceneMode.type === 'voxel' ? sceneMode.planet : '';
  const scene = useThree((s) => s.scene);

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
      <ChunkManager planet={planet} />
      <ambientLight intensity={ambientIntensity} color={ambientColor} />
      <directionalLight position={[120, 220, 160]} intensity={sunIntensity} color={0xfff8f0} />
      <DebugFlyCamera planet={planet} />
    </>
  );
}

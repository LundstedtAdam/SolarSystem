import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import {
  Euler,
  Group,
  Mesh,
  BoxGeometry,
  MeshStandardMaterial,
  Color,
  type PerspectiveCamera,
} from 'three';
import { useStore } from '../store';
import { getBiome } from '../terrain/biomes';
import { Player, type VoxelApi } from './player';
import { getSurfacePhysics } from './voxelPhysics';
import { voxelSpawnCenter } from './worldGen';
import { voxelInput, consumeLook, attachDesktopControls } from './voxelControls';

const LOOK_SENS = 0.0022;
const PITCH_LIMIT = Math.PI / 2 - 0.05;

/** Builds the visible first-person hand + tool, parented to the camera. */
function makeHand(biome: ReturnType<typeof getBiome>): Group {
  const g = new Group();
  const skin = new MeshStandardMaterial({ color: new Color(0.82, 0.66, 0.52), roughness: 0.9 });
  const tool = new MeshStandardMaterial({
    color: new Color(...biome.colorHigh),
    roughness: 0.6,
    metalness: 0.1,
  });
  // Forearm/hand.
  const arm = new Mesh(new BoxGeometry(0.16, 0.16, 0.5), skin);
  arm.position.set(0.32, -0.32, -0.5);
  arm.rotation.set(0.2, -0.2, 0.1);
  // Tool head poking forward (a simple pick/spade).
  const head = new Mesh(new BoxGeometry(0.1, 0.28, 0.1), tool);
  head.position.set(0.34, -0.18, -0.78);
  head.rotation.set(0.3, 0, 0.2);
  g.add(arm, head);
  g.renderOrder = 2;
  for (const m of [arm, head]) {
    m.castShadow = false;
    m.receiveShadow = false;
  }
  return g;
}

/** First-person controller: reads unified input, steps the player physics
 *  against the voxel grid, and drives the camera + visible hand. */
export function PlayerController({
  planet,
  apiRef,
}: {
  planet: string;
  apiRef: MutableRefObject<VoxelApi | null>;
}) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const player = useMemo(() => new Player(), []);
  const phys = useMemo(() => getSurfacePhysics(planet), [planet]);
  const euler = useMemo(() => new Euler(0, 0, 0, 'YXZ'), []);
  const ready = useRef(false);

  // Camera setup + desktop input wiring.
  useEffect(() => {
    camera.near = 0.05;
    camera.far = 2000;
    camera.fov = 75;
    camera.updateProjectionMatrix();
    ready.current = false;
    return attachDesktopControls(gl.domElement);
  }, [camera, gl, planet]);

  // Visible hand parented to the camera.
  useEffect(() => {
    const hand = makeHand(getBiome(planet));
    camera.add(hand);
    return () => {
      camera.remove(hand);
      hand.traverse((o) => {
        if (o instanceof Mesh) {
          o.geometry.dispose();
          (o.material as MeshStandardMaterial).dispose();
        }
      });
    };
  }, [camera, planet]);

  useFrame((_, dt) => {
    if (useStore.getState().sceneMode.type !== 'voxel') return;
    const api = apiRef.current;
    if (!api) return;

    if (!ready.current) {
      player.spawnAt(voxelSpawnCenter(planet));
      player.yaw = 0;
      player.pitch = 0;
      ready.current = true;
    }

    const look = consumeLook();
    player.yaw -= look.dx * LOOK_SENS;
    player.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, player.pitch - look.dy * LOOK_SENS));

    player.update(
      Math.min(dt, 0.05),
      { move: voxelInput.move, jump: voxelInput.jump, run: voxelInput.run },
      phys,
      api.isSolid,
    );

    euler.set(player.pitch, player.yaw, 0);
    camera.quaternion.setFromEuler(euler);
    camera.position.set(player.pos.x, player.eyeY(), player.pos.z);
  });

  return null;
}

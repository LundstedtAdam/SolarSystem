import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, type Group } from 'three';
import { useStore } from '../store';
import type { ResourceType } from './voxelTypes';

// Phase 11 — resources that overflowed the backpack sit on the terrain as small
// glowing cubes until re-collected (PlayerController handles pickup). Rendered
// only for the current body; a handful at a time, so individual meshes are fine.

const RESOURCE_COLOR: Record<ResourceType, [number, number, number]> = {
  carbon: [0.2, 0.2, 0.22],
  silicon: [0.6, 0.62, 0.68],
  iron: [0.5, 0.34, 0.26],
  copper: [0.72, 0.45, 0.2],
  zinc: [0.55, 0.6, 0.62],
  wolframite: [0.3, 0.25, 0.22],
  sphalerite: [0.56, 0.46, 0.2],
  malachite: [0.15, 0.55, 0.35],
  tungsten: [0.46, 0.48, 0.51],
  titanite: [0.7, 0.55, 0.25],
  hematite: [0.52, 0.29, 0.27],
  lithium: [0.85, 0.6, 0.7],
  artifact: [0.6, 0.3, 0.9],
};

function Drop({ pos, type }: { pos: [number, number, number]; type: ResourceType }) {
  const ref = useRef<Group>(null);
  const col = RESOURCE_COLOR[type];
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    g.rotation.y = state.clock.elapsedTime * 1.6;
    g.position.y = pos[1] + 0.15 + Math.sin(state.clock.elapsedTime * 2.5) * 0.12;
  });
  return (
    <group ref={ref} position={pos}>
      <mesh castShadow>
        <boxGeometry args={[0.45, 0.45, 0.45]} />
        <meshStandardMaterial
          color={new Color(...col)}
          emissive={new Color(...col)}
          emissiveIntensity={0.5}
          roughness={0.5}
        />
      </mesh>
    </group>
  );
}

export function DropItems({ planet }: { planet: string }) {
  const drops = useStore((s) => s.drops);
  return (
    <>
      {drops
        .filter((d) => d.planet === planet)
        .map((d) => (
          <Drop key={d.id} pos={d.pos} type={d.type} />
        ))}
    </>
  );
}

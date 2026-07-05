import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, type Mesh } from 'three';
import { useStore, type Structure } from '../store';

// Phase 11.2 — a small rotating holographic wireframe floating above each
// crafting station (the "fabricator" projection). Cheap: a wireframe
// icosahedron; brightens slightly while the station's craft menu is open.

function Hologram({ s }: { s: Structure }) {
  const ref = useRef<Mesh>(null);
  useFrame((state) => {
    const m = ref.current;
    if (!m) return;
    m.rotation.y = state.clock.elapsedTime * 0.9;
    m.rotation.x = Math.sin(state.clock.elapsedTime * 0.5) * 0.3;
    const s2 = 0.55 + Math.sin(state.clock.elapsedTime * 2) * 0.03;
    m.scale.setScalar(s2);
  });
  return (
    <mesh ref={ref} position={[s.pos[0] + 0.5, s.pos[1] + 2.4, s.pos[2] + 0.5]}>
      <icosahedronGeometry args={[1, 0]} />
      <meshBasicMaterial
        color={new Color(0.4, 0.85, 1.0)}
        wireframe
        transparent
        opacity={0.55}
        toneMapped={false}
      />
    </mesh>
  );
}

export function StationVisuals({ planet }: { planet: string }) {
  const structures = useStore((s) => s.structures);
  return (
    <>
      {structures
        .filter((s) => s.planet === planet && s.type === 'station')
        .map((s) => (
          <Hologram key={s.id} s={s} />
        ))}
    </>
  );
}

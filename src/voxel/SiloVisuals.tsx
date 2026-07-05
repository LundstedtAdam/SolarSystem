import { Color } from 'three';
import { useStore, structureUsed, type Structure } from '../store';
import type { ResourceType } from './voxelTypes';
import { RESOURCE_COLOR } from './resourceProfiles';

// Phase 11.1 — the "physical resource blocks visibly stacked" on a silo. The
// silo's post is real voxels (chunk mesh); this renders the stored contents as a
// growing column of coloured cubes above the glass cap, one short run per
// resource type. Cheap: a handful of silos, a few cubes each.

const CAP_Y = 3; // post is 3 tall (SILO, METAL, GLASS) — stack sits above it
const PER_CUBE = 20; // stored units represented by one cube
const MAX_CUBES = 8; // cap the visible stack height

function SiloStack({ s }: { s: Structure }) {
  const total = structureUsed(s);
  if (total <= 0) return null;
  // Build a flat list of cube colours, proportional to each resource's share.
  const cubes: [number, number, number][] = [];
  for (const k in s.stored) {
    const type = k as ResourceType;
    const n = Math.round((s.stored[type] ?? 0) / PER_CUBE);
    for (let i = 0; i < n && cubes.length < MAX_CUBES; i++) cubes.push(RESOURCE_COLOR[type]);
  }
  if (cubes.length === 0) cubes.push([0.7, 0.7, 0.7]); // tiny amount: show one nub
  return (
    <group position={[s.pos[0] + 0.5, s.pos[1], s.pos[2] + 0.5]}>
      {cubes.map((c, i) => (
        <mesh key={i} position={[0, CAP_Y + 0.35 + i * 0.34, 0]} castShadow>
          <boxGeometry args={[0.5, 0.32, 0.5]} />
          <meshStandardMaterial
            color={new Color(...c)}
            emissive={new Color(...c)}
            emissiveIntensity={0.25}
            roughness={0.6}
          />
        </mesh>
      ))}
    </group>
  );
}

export function SiloVisuals({ planet }: { planet: string }) {
  const structures = useStore((s) => s.structures);
  return (
    <>
      {structures
        .filter((s) => s.planet === planet && s.type === 'silo')
        .map((s) => (
          <SiloStack key={s.id} s={s} />
        ))}
    </>
  );
}

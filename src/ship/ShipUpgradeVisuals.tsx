// Phase 11.5 — procedural visual layers for ship upgrades. There's no custom
// modular ship model yet (a Blender pipeline is planned later), so each
// upgrade is instead a small extra mesh/effect layered on top of the existing
// GLTF/fallback hull — approximate placement, but always visibly present so an
// upgrade never reads as "just a stat in a menu."

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  Group,
  Mesh,
  SphereGeometry,
  BoxGeometry,
  CylinderGeometry,
  ConeGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  Color,
  AdditiveBlending,
  BackSide,
} from 'three';
import { useStore } from '../store';

/** Engine glow: color/intensity climbs with hyperdrive tier, from a dim ember
 *  to a bright violet-white flare. */
const ENGINE_GLOW = [
  { color: new Color(0.3, 0.45, 0.9), intensity: 0.5, scale: 0.7 },
  { color: new Color(0.3, 0.6, 1.9), intensity: 1.0, scale: 0.9 },
  { color: new Color(0.5, 0.9, 2.0), intensity: 1.5, scale: 1.05 },
  { color: new Color(0.95, 0.65, 2.2), intensity: 2.2, scale: 1.25 },
];

function EngineGlow({ tier }: { tier: number }) {
  const glowRef = useRef<Mesh>(null);
  const cfg = ENGINE_GLOW[Math.min(tier, ENGINE_GLOW.length - 1)];

  const geometry = useMemo(() => {
    const geo = new ConeGeometry(0.16, 0.5, 8);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color: cfg.color,
        emissive: cfg.color,
        emissiveIntensity: cfg.intensity,
        transparent: true,
        opacity: 0.75,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    [cfg],
  );

  useFrame(() => {
    if (!glowRef.current) return;
    const flicker = 0.9 + Math.random() * 0.2;
    glowRef.current.scale.setScalar(cfg.scale * flicker);
  });

  return (
    <mesh
      ref={glowRef}
      geometry={geometry}
      material={material}
      position={[0, -0.05, 0.75]}
      renderOrder={3}
    />
  );
}

/** Environmental shielding: a translucent, slowly pulsing hull-hugging shell —
 *  present at all once equipped (tier >= 1), not just "when active", so it
 *  reads as a permanent piece of gear rather than a toggle. */
function ShieldShell({ tier }: { tier: number }) {
  const meshRef = useRef<Mesh>(null);
  const geometry = useMemo(() => new SphereGeometry(0.85 + tier * 0.05, 20, 14), [tier]);
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: new Color(0.4, 0.75, 1.0),
        transparent: true,
        opacity: 0.08 + tier * 0.03,
        side: BackSide,
        depthWrite: false,
      }),
    [tier],
  );

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const pulse = 1 + Math.sin(clock.elapsedTime * 1.4) * 0.02;
    meshRef.current.scale.setScalar(pulse);
  });

  return <mesh ref={meshRef} geometry={geometry} material={material} renderOrder={4} />;
}

/** Cargo expansion: visible external containers bolted to the hull — one
 *  appears per tier, so capacity growth is something you can literally see. */
const CARGO_SLOTS: [number, number, number][] = [
  [0.42, -0.08, -0.1],
  [-0.42, -0.08, -0.1],
  [0, -0.32, -0.15],
];

function CargoContainers({ tier }: { tier: number }) {
  const geometry = useMemo(() => new BoxGeometry(0.22, 0.16, 0.32), []);
  const material = useMemo(
    () => new MeshStandardMaterial({ color: 0xb8a35a, metalness: 0.4, roughness: 0.6 }),
    [],
  );
  return (
    <>
      {CARGO_SLOTS.slice(0, tier).map((pos, i) => (
        <mesh key={i} geometry={geometry} material={material} position={pos} castShadow />
      ))}
    </>
  );
}

/** Orbital scanner: a small dish-on-a-stalk that appears once unlocked,
 *  slowly rotating to sell "actively scanning." */
function ScannerDish({ tier }: { tier: number }) {
  const dishRef = useRef<Group>(null);
  const stalkGeo = useMemo(() => new CylinderGeometry(0.015, 0.02, 0.18, 6), []);
  const dishGeo = useMemo(() => new CylinderGeometry(0.09 + tier * 0.02, 0.03, 0.05, 12), [tier]);
  const material = useMemo(
    () => new MeshStandardMaterial({ color: 0xd8dde2, metalness: 0.6, roughness: 0.35 }),
    [],
  );

  useFrame((_, dt) => {
    if (dishRef.current) dishRef.current.rotation.y += dt * 0.6;
  });

  return (
    <group position={[0, 0.32, -0.1]}>
      <mesh geometry={stalkGeo} material={material} />
      <group ref={dishRef} position={[0, 0.11, 0]}>
        <mesh geometry={dishGeo} material={material} rotation={[Math.PI / 2.4, 0, 0]} />
      </group>
    </group>
  );
}

/** Mounted alongside the hull model (both the piloting and surface-park ship
 *  instances) — reads the store directly so callers don't need to thread
 *  upgrade state through. */
export function ShipUpgradeVisuals() {
  const upgrades = useStore((s) => s.shipUpgrades);

  return (
    <group>
      <EngineGlow tier={upgrades.hyperdrive} />
      {upgrades.shielding > 0 && <ShieldShell tier={upgrades.shielding} />}
      {upgrades.cargo > 0 && <CargoContainers tier={upgrades.cargo} />}
      {upgrades.scanner > 0 && <ScannerDish tier={upgrades.scanner} />}
    </group>
  );
}

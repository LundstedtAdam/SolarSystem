import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  IcosahedronGeometry,
  SphereGeometry,
  MeshStandardMaterial,
  Vector3,
  type Group,
} from 'three/webgpu';
import { useStore } from '../store';
import { shipTelemetry } from '../ship/shipTelemetry';
import { asteroidRuntime } from './asteroidRuntime';
import { rotateY } from '../ship/shipCollision';
import { SPACE_POIS, isAnchoredPoi, type SpacePoiSpec, type FixedSpacePoi } from '../systems/spacePoiProfiles';

const _worldPos = new Vector3();

/** Resolves a POI's current world position: fixed POIs return their stored
 *  position; anchored POIs read the live (possibly belt-rotated) position of
 *  their host asteroid, never a cached value. Returns false if the anchor
 *  asteroid isn't available yet (belt not built at this quality tier). */
function resolvePoiWorldPos(spec: SpacePoiSpec, out: Vector3): boolean {
  if (isAnchoredPoi(spec)) {
    const state = asteroidRuntime.states[spec.anchorGlobalIdx];
    if (!state || !state.alive) return false;
    rotateY(state.pos, asteroidRuntime.groupYaw, out);
    return true;
  }
  out.set(spec.pos[0], spec.pos[1], spec.pos[2]);
  return true;
}

const KIND_COLOR: Record<FixedSpacePoi['kind'], [number, number, number]> = {
  wreckage: [0.5, 0.48, 0.45],
  anomaly: [0.3, 0.9, 0.8],
  resourceCluster: [0.85, 0.65, 0.2],
  landmark: [0.6, 0.55, 0.65],
};

/**
 * Space-specific points of interest: fixed-position markers (anomaly signal,
 * resource cluster, distant landmark) plus proximity-based auto-discovery for
 * every POI in `spacePoiProfiles.ts`, including asteroid-anchored wreckage.
 * Discovery is proximity-triggered rather than a manual "press scan" button
 * (the voxel-surface convention) — space POIs are meant to be found by
 * flying near them, not by aiming a crosshair, so this reads as "exploration
 * finds it" rather than requiring a second parallel scan-UI for the ship.
 * Both routes call the exact same `recordDiscovery`/journal the voxel POI
 * system already uses (`planet: 'space'`), so no new journal data shape.
 */
export function SpacePoiField() {
  const groupRef = useRef<Group>(null);

  const fixedMarkers = useMemo(() => {
    return SPACE_POIS.filter((s): s is FixedSpacePoi => !isAnchoredPoi(s)).map((spec) => {
      const isLandmark = spec.kind === 'landmark';
      const geometry = isLandmark ? new IcosahedronGeometry(6, 1) : new SphereGeometry(1.5, 12, 12);
      const [r, g, b] = KIND_COLOR[spec.kind];
      const material = new MeshStandardMaterial({
        color: `rgb(${r * 255}, ${g * 255}, ${b * 255})`,
        emissive: spec.kind === 'anomaly' ? `rgb(${r * 255}, ${g * 255}, ${b * 255})` : 0x000000,
        emissiveIntensity: spec.kind === 'anomaly' ? 0.8 : 0,
        roughness: 0.8,
        metalness: 0.2,
      });
      return { spec, geometry, material };
    });
  }, []);

  useFrame(() => {
    const store = useStore.getState();

    // Flag anchored POIs' host asteroids indestructible — idempotent, cheap,
    // re-applied every frame so it survives a belt rebuild on quality change.
    for (const spec of SPACE_POIS) {
      if (!isAnchoredPoi(spec)) continue;
      const state = asteroidRuntime.states[spec.anchorGlobalIdx];
      if (state && !state.indestructible) state.indestructible = true;
    }

    if (store.sceneMode.type !== 'piloting') return;
    for (const spec of SPACE_POIS) {
      const key = `space:${spec.id}`;
      if (store.discovered[key]) continue;
      if (!resolvePoiWorldPos(spec, _worldPos)) continue;
      if (shipTelemetry.position.distanceTo(_worldPos) <= spec.scanRadius) {
        store.recordDiscovery({
          planet: 'space',
          id: spec.id,
          name: spec.name,
          story: spec.story,
          clue: spec.clue,
          mysteryId: spec.mysteryId,
          speculative: spec.speculative,
        });
      }
    }
  });

  return (
    <group ref={groupRef}>
      {fixedMarkers.map(({ spec, geometry, material }) => (
        <mesh key={spec.id} geometry={geometry} material={material} position={spec.pos} />
      ))}
    </group>
  );
}

import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useStore } from '../store';
import { shipTelemetry } from '../ship/shipTelemetry';
import {
  raycastAsteroids,
  installMiningInput,
  removeMiningInput,
  isFiring,
  MINING_RANGE,
  MINING_DPS,
  MINING_IMPACT_SPEED,
} from '../ship/spaceMining';
import { applyAsteroidDamage } from '../systems/asteroidFracture';
import { debrisRuntime } from './debrisRuntime';
import { SHIP_COLLISION_RADIUS } from '../ship/shipPhysics';

/** Ore chunks within this range of the ship start homing toward it (a small
 *  one-way pull on the ore, never a force on the ship — doesn't reintroduce
 *  a gravity well, same category of effect as a tractor-beam gadget). */
const MAGNET_RANGE = 12;
const MAGNET_ACCEL = 40;
/** Collected once within this distance of the ship. */
const COLLECT_RANGE = SHIP_COLLISION_RADIUS + 0.5;
const ORE_YIELD = 1;

const _origin = new Vector3();
const _dir = new Vector3();
const _impactVel = new Vector3();
const _toShip = new Vector3();

/**
 * Space mining/weapon system: aims a fixed screen-center ray (mirroring the
 * voxel mining crosshair convention), damages the targeted asteroid via the
 * same `applyAsteroidDamage` pipeline collision uses, and separately pulls +
 * collects any ore-flagged debris that drifts near the ship. Runs its own
 * `useFrame` slot, kept separate from `ShipController.tsx`'s movement loop —
 * mirrors how `ShipCamera.tsx` is already a standalone component reading the
 * shared ship telemetry.
 */
export function SpaceMiningController() {
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    installMiningInput();
    return () => removeMiningInput();
  }, []);

  useFrame((_, delta) => {
    const store = useStore.getState();
    if (store.sceneMode.type !== 'piloting') return;
    const dt = Math.min(delta, 0.05);

    if (isFiring()) {
      _origin.copy(camera.position);
      camera.getWorldDirection(_dir);
      const hit = raycastAsteroids(_origin, _dir, MINING_RANGE);
      if (hit) {
        _impactVel.copy(_dir).multiplyScalar(MINING_IMPACT_SPEED);
        applyAsteroidDamage(hit.globalIdx, MINING_DPS * dt, hit.point, _impactVel);
      }
    }

    // Ore magnetism + collection — backward swap-remove, safe regardless of
    // whether this runs before or after AsteroidDebris.tsx's integration
    // pass this same frame (each pass only touches the array it currently
    // sees; JS is single-threaded, so there's no concurrent-mutation hazard).
    const list = debrisRuntime.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const d = list[i];
      if (!d.isOre) continue;
      _toShip.copy(shipTelemetry.position).sub(d.pos);
      const dist = _toShip.length();
      if (dist <= COLLECT_RANGE) {
        if (d.resourceType) {
          store.mineResource(d.resourceType, ORE_YIELD, 'space', [d.pos.x, d.pos.y, d.pos.z]);
        }
        list[i] = list[list.length - 1];
        list.pop();
        continue;
      }
      if (dist <= MAGNET_RANGE && dist > 1e-4) {
        _toShip.multiplyScalar(1 / dist);
        d.vel.addScaledVector(_toShip, MAGNET_ACCEL * dt);
      }
    }
  });

  return null;
}

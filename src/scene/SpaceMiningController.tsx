import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, BufferGeometry, BufferAttribute, Line, LineBasicMaterial, AdditiveBlending } from 'three/webgpu';
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
import { spaceMiningTelemetry } from '../ship/spaceMiningTelemetry';
import { applyAsteroidDamage } from '../systems/asteroidFracture';
import { debrisRuntime } from './debrisRuntime';
import { SHIP_COLLISION_RADIUS } from '../ship/shipPhysics';
import { audio } from '../audio/AudioManager';

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

  // Visual beam — a single line updated in place each frame, only visible
  // while firing. No pooling needed: this is one object, not a population.
  const beam = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(6), 3));
    const material = new LineBasicMaterial({
      color: 0xff8850,
      transparent: true,
      opacity: 0.8,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const line = new Line(geometry, material);
    line.frustumCulled = false;
    line.visible = false;
    return line;
  }, []);

  useEffect(() => {
    return () => {
      beam.geometry.dispose();
      (beam.material as LineBasicMaterial).dispose();
    };
  }, [beam]);

  useFrame((_, delta) => {
    const store = useStore.getState();
    if (store.sceneMode.type !== 'piloting') {
      beam.visible = false;
      audio.setMiningBeam(false, false);
      return;
    }
    const dt = Math.min(delta, 0.05);

    // Raycast every frame regardless of firing — the crosshair reacts to
    // "is something targetable right now," not just while the trigger is
    // held (matches the genre convention of a reticle that highlights on a
    // valid target, e.g. Freelancer/Elite, rather than staying inert).
    _origin.copy(camera.position);
    camera.getWorldDirection(_dir);
    const hit = raycastAsteroids(_origin, _dir, MINING_RANGE);
    spaceMiningTelemetry.aiming = hit !== null;
    spaceMiningTelemetry.hitPoint = hit ? hit.point : null;

    const firing = isFiring();
    audio.setMiningBeam(firing, hit !== null);

    if (firing && hit) {
      _impactVel.copy(_dir).multiplyScalar(MINING_IMPACT_SPEED);
      applyAsteroidDamage(hit.globalIdx, MINING_DPS * dt, hit.point, _impactVel);
    }

    beam.visible = firing;
    if (firing) {
      const endPoint = hit ? hit.point : _origin.clone().addScaledVector(_dir, MINING_RANGE);
      const posAttr = beam.geometry.attributes.position as BufferAttribute;
      posAttr.setXYZ(0, _origin.x, _origin.y, _origin.z);
      posAttr.setXYZ(1, endPoint.x, endPoint.y, endPoint.z);
      posAttr.needsUpdate = true;
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

  return <primitive object={beam} />;
}

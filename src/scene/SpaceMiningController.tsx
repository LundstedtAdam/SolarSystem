import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three/webgpu';
import { useStore } from '../store';
import { shipTelemetry } from '../ship/shipTelemetry';
import {
  raycastAsteroids,
  installMiningInput,
  removeMiningInput,
  isFiring,
  MINING_RANGE,
  FIRE_RATE,
  PROJECTILE_SPEED,
} from '../ship/spaceMining';
import { spaceMiningTelemetry } from '../ship/spaceMiningTelemetry';
import { projectileRuntime } from './projectileRuntime';
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

const FIRE_INTERVAL = 1 / FIRE_RATE;
/** Weapon hardpoint offset from the ship's center, in ship-local space
 *  (local forward is -Z, matching `ShipModel.tsx`/`computeThrust`'s
 *  convention) — a fixed point just ahead of and below the nose, so a shot
 *  visibly leaves the hull rather than materializing at the camera. */
const HARDPOINT_FORWARD = 0.7;
const HARDPOINT_DOWN = 0.08;

const _origin = new Vector3();
const _dir = new Vector3();
const _hardpointLocal = new Vector3();
const _hardpointWorld = new Vector3();
const _shotVel = new Vector3();
const _toShip = new Vector3();

/**
 * Space mining/weapon system: aims a fixed screen-center ray (mirroring the
 * voxel mining crosshair convention, and used here only for the crosshair's
 * "is something targetable right now" telemetry) and fires discrete,
 * automatic shots at a fixed cadence while the trigger is held. Each shot is
 * a real traveling projectile — spawned at the ship's own weapon hardpoint
 * with its own finite velocity (ship velocity + launch speed, real momentum
 * transfer), not an instant hit resolved from the camera. The projectile's
 * own per-frame flight/collision/impact pipeline lives in
 * `projectilePhysics.ts`/`Projectiles.tsx`; this component only owns firing
 * cadence, hardpoint placement, launch audio, aim telemetry, and ore
 * magnetism/collection. Runs its own `useFrame` slot, kept separate from
 * `ShipController.tsx`'s movement loop — mirrors how `ShipCamera.tsx` is
 * already a standalone component reading the shared ship telemetry.
 */
export function SpaceMiningController() {
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    installMiningInput();
    return () => removeMiningInput();
  }, []);

  // Fire-rate accumulator, plus edge detection so the first shot fires the
  // instant the trigger is pulled rather than waiting a full interval
  // (standard automatic-weapon feel).
  const fireAcc = useRef(0);
  const wasFiring = useRef(false);

  const fireShot = () => {
    // Launch sound plays immediately; a distinct higher-pitched hit chirp
    // plays separately, later, only if this specific shot actually connects
    // (projectilePhysics.ts) — travel time means we don't know that yet.
    audio.playMiningShot(false);

    _hardpointLocal.set(0, -HARDPOINT_DOWN, -HARDPOINT_FORWARD);
    _hardpointWorld.copy(_hardpointLocal).applyQuaternion(shipTelemetry.rotation).add(shipTelemetry.position);
    _shotVel.copy(shipTelemetry.velocity).addScaledVector(_dir, PROJECTILE_SPEED);
    projectileRuntime.spawn({ pos: _hardpointWorld, vel: _shotVel });
  };

  useFrame((_, delta) => {
    const store = useStore.getState();
    if (store.sceneMode.type !== 'piloting') {
      wasFiring.current = false;
      fireAcc.current = 0;
      return;
    }
    const dt = Math.min(delta, 0.05);

    // Raycast every frame regardless of firing — the crosshair reacts to
    // "is something targetable right now," not just while the trigger is
    // held (matches the genre convention of a reticle that highlights on a
    // valid target, e.g. Freelancer/Elite, rather than staying inert). This
    // is aim assist for the reticle only — it does not resolve the shot
    // itself, which is the spawned projectile's own job.
    _origin.copy(camera.position);
    camera.getWorldDirection(_dir);
    const hit = raycastAsteroids(_origin, _dir, MINING_RANGE);
    spaceMiningTelemetry.aiming = hit !== null;
    spaceMiningTelemetry.hitPoint = hit ? hit.point : null;

    const firing = isFiring();
    if (firing) {
      if (!wasFiring.current) {
        wasFiring.current = true;
        fireAcc.current = FIRE_INTERVAL; // fire immediately this frame
      }
      fireAcc.current += dt;
      while (fireAcc.current >= FIRE_INTERVAL) {
        fireAcc.current -= FIRE_INTERVAL;
        fireShot();
      }
    } else {
      wasFiring.current = false;
      fireAcc.current = 0;
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

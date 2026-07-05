import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Matrix4, Quaternion, Vector3 } from 'three';
import { useStore } from '../store';
import {
  updateRotation,
  computeThrust,
  integrate,
  ASSIST_DAMPING,
  DRIFT_DAMPING,
  SHIP_COLLISION_RADIUS,
  type AngularVelocity,
  type ShipInput,
} from './shipPhysics';
import { resolvePlanetCollision } from './shipCollision';
import { readInput, installKeyboardListeners, removeKeyboardListeners } from './shipInput';
import { shipTelemetry, syncTelemetryFromStore, MIRROR_INTERVAL } from './shipTelemetry';
import { decayStick, resetStick } from './virtualStick';
import { resolveDescentTarget, findNearestLandable, landRange } from '../descent/descentHelpers';
import { ShipModel } from './ShipModel';

const _pos = new Vector3();
const _vel = new Vector3();
const _accel = new Vector3();
const _quat = new Quaternion();
const _autoDir = new Vector3();
const _autoTarget = new Vector3();
const _lookM = new Matrix4();
const _lookQ = new Quaternion();
const _up = new Vector3(0, 1, 0);

/** Whether the player is actively commanding the ship (used to break autopilot). */
function manualInputActive(input: ShipInput): boolean {
  return (
    Math.abs(input.thrust) > 0.04 ||
    Math.abs(input.yaw) > 0.08 ||
    Math.abs(input.pitch) > 0.08 ||
    Math.abs(input.roll) > 0.08
  );
}

/** Edge-state for the flight gamepad action buttons (Land/Nav/Pause). */
const padFlightPrev = { land: false, nav: false, pause: false };

/**
 * Edge-triggered flight gamepad actions, polled once per piloting frame:
 *   A (0)     — Land, when within landing range of the nearest body
 *   Y (3)     — open/close the quick-nav body picker
 *   Start (9) — pause/resume the simulation
 * Throttle (triggers), yaw/pitch/roll (sticks) and fine control (LB) are handled
 * in shipInput; this covers the remaining discrete actions.
 */
function pollFlightGamepad(store: ReturnType<typeof useStore.getState>) {
  const pads = navigator.getGamepads?.();
  if (!pads) return;
  let gp: Gamepad | null = null;
  for (const p of pads) {
    if (p) {
      gp = p;
      break;
    }
  }
  if (!gp) {
    padFlightPrev.land = padFlightPrev.nav = padFlightPrev.pause = false;
    return;
  }

  const landDown = !!gp.buttons[0]?.pressed;
  if (landDown && !padFlightPrev.land) {
    const nearest = findNearestLandable(_pos, store.simTimeDays);
    if (nearest && nearest.distance < landRange(nearest.size)) store.beginDescent(nearest.name);
  }
  padFlightPrev.land = landDown;

  const navDown = !!gp.buttons[3]?.pressed;
  if (navDown && !padFlightPrev.nav) store.setNavPickerOpen(!store.navPickerOpen);
  padFlightPrev.nav = navDown;

  const pauseDown = !!gp.buttons[9]?.pressed;
  if (pauseDown && !padFlightPrev.pause) store.togglePause();
  padFlightPrev.pause = pauseDown;
}

// Quick-nav autopilot tuning. Cruise/decel are in render units; the safe stop
// distance is proportional to the body's render radius so it scales with the
// world. Steering eases the ship's facing toward the destination for a smooth,
// cinematic arc rather than a snap.
const AUTO_CRUISE = 650; // peak approach speed (units/s)
const AUTO_DECEL = 320; // braking authority (units/s²) — sets the stop ramp
const AUTO_TURN_RATE = 2.5; // facing ease rate (1/s)
const AUTO_SAFE_RADII = 4; // stop this many body-radii out (matches orbit phase)

export function ShipController() {
  const groupRef = useRef<Group>(null);
  const angVel = useRef<AngularVelocity>({ pitch: 0, yaw: 0, roll: 0 });
  // Live telemetry <-> store hand-off (see shipTelemetry.ts). `wasPiloting`
  // detects mode transitions; `mirrorAcc` paces the reactive-store mirror.
  const wasPiloting = useRef(false);
  const mirrorAcc = useRef(0);

  useEffect(() => {
    installKeyboardListeners();
    return () => removeKeyboardListeners();
  }, []);

  /** Push the live telemetry into the reactive store (HUD and non-piloting
   *  consumers read from there). */
  function mirrorToStore(store: ReturnType<typeof useStore.getState>) {
    const t = shipTelemetry;
    store.setShipPosition([t.position.x, t.position.y, t.position.z]);
    store.setShipVelocity([t.velocity.x, t.velocity.y, t.velocity.z]);
    store.setShipRotation([t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w]);
    store.setShipThrottle(t.throttle);
  }

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const store = useStore.getState();
    if (store.sceneMode.type !== 'piloting') {
      // Leaving piloting: flush the exact live state to the store once, before
      // the descent/ascent managers (registered after us) read it this frame.
      if (wasPiloting.current) {
        wasPiloting.current = false;
        mirrorToStore(store);
      }
      // During descent/ascent the managers drive the store — follow it here so
      // the ship model tracks the cinematic path (previously done by a reactive
      // store subscription that re-rendered this component every frame).
      const [sx, sy, sz] = store.shipPosition;
      const [rx, ry, rz, rw] = store.shipRotation;
      group.position.set(sx, sy, sz);
      group.quaternion.set(rx, ry, rz, rw);
      // Shed any residual spin so re-entering the ship starts settled.
      angVel.current.pitch = 0;
      angVel.current.yaw = 0;
      angVel.current.roll = 0;
      resetStick();
      return;
    }

    if (!wasPiloting.current) {
      // Entering piloting: the store is authoritative (descent/ascent/surface
      // wrote it) — load it into the live telemetry.
      wasPiloting.current = true;
      mirrorAcc.current = 0;
      syncTelemetryFromStore(
        store.shipPosition,
        store.shipVelocity,
        store.shipRotation,
        store.shipThrottle,
      );
    }

    const dt = Math.min(delta, 0.05);

    // Spring the mouse virtual joystick back toward center (frame-rate
    // independent). Fresh pointer deltas this frame skip the decay internally.
    decayStick(dt);

    _pos.copy(shipTelemetry.position);
    _vel.copy(shipTelemetry.velocity);
    _quat.copy(shipTelemetry.rotation);

    // Discrete gamepad flight actions (Land / Nav / Pause).
    pollFlightGamepad(store);

    const cfg = store.controls;
    const input = readInput();

    // Quick-nav autopilot: when a destination is set and the player isn't
    // touching the controls, fly there cinematically and stop at a safe orbit.
    // Any manual input immediately hands control back.
    if (store.autopilotTarget) {
      if (manualInputActive(input)) {
        store.cancelAutopilot();
      } else {
        runAutopilot(store, dt, group);
        return;
      }
    }

    updateRotation(_quat, angVel.current, input, cfg.sensitivity, dt);

    // Pure thrust — no gravitational pull from nearby bodies, so flight always
    // feels clean and intentional (Phase 11).
    _accel.set(0, 0, 0);
    const thrust = computeThrust(_quat, input.thrust);
    _accel.add(thrust);

    const damping = cfg.flightAssist ? ASSIST_DAMPING : DRIFT_DAMPING;
    integrate(_pos, _vel, _accel, damping, dt);

    // Slide off planets/moons on contact — a position/velocity constraint
    // applied only on contact, never an added force, so it can't reintroduce
    // the gravity well deliberately removed from free flight (Phase 11).
    resolvePlanetCollision(_pos, _vel, store.simTimeDays, SHIP_COLLISION_RADIUS);

    group.position.copy(_pos);
    group.quaternion.copy(_quat);

    // Live telemetry every frame (camera reads it back this frame); the
    // reactive store only gets a low-rate mirror so HUD components don't
    // re-render at 60 fps. The raw lever position (0..1) is kept so the HUD
    // zones and last-quarter effects key off the slider, not post-curve thrust.
    shipTelemetry.position.copy(_pos);
    shipTelemetry.velocity.copy(_vel);
    shipTelemetry.rotation.copy(_quat);
    shipTelemetry.throttle = input.throttleRaw ?? Math.abs(input.thrust);
    mirrorAcc.current += dt;
    if (mirrorAcc.current >= MIRROR_INTERVAL) {
      mirrorAcc.current = 0;
      mirrorToStore(store);
    }
  });

  /** Steer-and-brake autopilot toward the current quick-nav target. Operates on
   *  the module scratch vectors already loaded with the ship state this frame. */
  function runAutopilot(
    store: ReturnType<typeof useStore.getState>,
    dt: number,
    group: Group,
  ) {
    const resolved = resolveDescentTarget(store.autopilotTarget!, store.simTimeDays);
    if (!resolved) {
      store.cancelAutopilot();
      return;
    }
    _autoTarget.copy(resolved.worldPos);
    const safeDist = resolved.size * AUTO_SAFE_RADII;

    _autoDir.copy(_autoTarget).sub(_pos);
    const dist = _autoDir.length();
    const remaining = dist - safeDist;
    if (dist > 1e-4) _autoDir.multiplyScalar(1 / dist);

    // Ease the ship's facing toward the destination (smooth cinematic turn).
    _lookM.lookAt(_pos, _autoTarget, _up);
    _lookQ.setFromRotationMatrix(_lookM);
    _quat.slerp(_lookQ, 1 - Math.exp(-AUTO_TURN_RATE * dt));

    // Speed profile: cap at cruise, but never faster than what can still brake to
    // a stop over the remaining distance — so it glides in and halts at the orbit.
    const brakeSpeed = Math.sqrt(Math.max(remaining, 0) * 2 * AUTO_DECEL);
    const desiredSpeed = Math.max(0, Math.min(AUTO_CRUISE, brakeSpeed));

    if (remaining <= 1 && desiredSpeed < 1) {
      // Arrived at a safe orbital distance — stop, flush the exact state to
      // the store, and return control.
      _vel.set(0, 0, 0);
      shipTelemetry.velocity.set(0, 0, 0);
      shipTelemetry.rotation.copy(_quat);
      shipTelemetry.throttle = 0;
      group.quaternion.copy(_quat);
      mirrorToStore(store);
      store.cancelAutopilot();
      return;
    }

    _vel.copy(_autoDir).multiplyScalar(desiredSpeed);
    _pos.addScaledVector(_vel, dt);

    group.position.copy(_pos);
    group.quaternion.copy(_quat);
    shipTelemetry.position.copy(_pos);
    shipTelemetry.velocity.copy(_vel);
    shipTelemetry.rotation.copy(_quat);
    shipTelemetry.throttle = Math.min(desiredSpeed / AUTO_CRUISE, 1);
    mirrorAcc.current += dt;
    if (mirrorAcc.current >= MIRROR_INTERVAL) {
      mirrorAcc.current = 0;
      mirrorToStore(store);
    }
  }

  // Initial mount position only — every subsequent frame the useFrame above
  // moves the group directly, so a reactive subscription here would just force
  // a React re-render per store mirror for nothing.
  const [px, py, pz] = useStore.getState().shipPosition;

  return (
    <group ref={groupRef} position={[px, py, pz]}>
      <ShipModel />
    </group>
  );
}

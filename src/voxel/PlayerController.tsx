import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import {
  Euler,
  Group,
  Mesh,
  BoxGeometry,
  MeshStandardMaterial,
  Color,
  Vector3,
  type PerspectiveCamera,
} from 'three';
import { useStore } from '../store';
import { getBiome } from '../terrain/biomes';
import { audio } from '../audio/AudioManager';
import { Player, type VoxelApi } from './player';
import { getSurfacePhysics } from './voxelPhysics';
import { voxelSpawnCenter, surfaceHeightAt } from './worldGen';
import { getVoxelTerrain } from './voxelBiomes';
import { seedFromName } from './noise';
import { footstepFor } from './voxelAudio';
import {
  computeSafety,
  respawnAnchor,
  O2_MAX_SECONDS,
  O2_REFILL_RATE,
  O2_WARN_HALF,
  O2_WARN_LOW,
} from './survival';
import {
  voxelInput,
  voxelTelemetry,
  voxelSilo,
  voxelStation,
  consumeLook,
  consumePlace,
  consumeDeposit,
  attachDesktopControls,
  pollVoxelGamepad,
  cubicLook,
} from './voxelControls';

const PITCH_LIMIT = Math.PI / 2 - 0.05;
/** Squared distance within which the player vacuums up a ground drop. */
const PICKUP_RANGE_SQ = 2.0 * 2.0;
/** Squared range over which a silo pulls in nearby ground drops. */
const SILO_ABSORB_SQ = 5.0 * 5.0;
/** Squared range within which the player can manually deposit into a silo. */
const DEPOSIT_SQ = 3.5 * 3.5;
/** Squared range within which the player can craft at a station. */
const CRAFT_SQ = 3.5 * 3.5;

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
  const terrain = useMemo(() => getVoxelTerrain(planet), [planet]);
  const seed = useMemo(() => seedFromName(planet), [planet]);
  const euler = useMemo(() => new Euler(0, 0, 0, 'YXZ'), []);
  const ready = useRef(false);
  const stride = useRef(0); // accumulated walk distance for footsteps
  const lastCave = useRef(-1);
  const refineAcc = useRef(0); // throttles refineTick to ~1/s

  // Phase 11.4 survival — simulated here (the frame loop owns dt + player pos);
  // the store only mirrors a throttled fraction for the HUD. All of it is
  // gated on !creativeMode: in creative none of this runs at all.
  const o2 = useRef(O2_MAX_SECONDS);
  const o2Hud = useRef(0); // throttle accumulator for store mirrors
  const warnedHalf = useRef(false);
  const warnedLow = useRef(false);
  const heartbeat = useRef(0);
  const wasCreative = useRef(true);
  const shipPos = useMemo<[number, number, number]>(() => {
    const s = voxelSpawnCenter(planet);
    return [s.x, s.y, s.z];
  }, [planet]);

  const fov = useStore((s) => s.fov);

  // Camera setup + desktop input wiring. FOV is applied in its own effect so a
  // mid-session slider change doesn't reset `ready` (which would respawn the
  // player at the origin).
  useEffect(() => {
    camera.near = 0.05;
    camera.far = 2000;
    camera.updateProjectionMatrix();
    ready.current = false;
    return attachDesktopControls(gl.domElement);
  }, [camera, gl, planet]);

  useEffect(() => {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }, [camera, fov]);

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

    // Gamepad: write the shared input (move/look/jump/dig/scan) and surface the
    // edge-triggered "back to ship" so it matches the flight pad's deadzone/curve.
    const cfg = useStore.getState().controls;
    const { back } = pollVoxelGamepad(Math.min(dt, 0.05), cfg.deadzone);
    if (back) {
      useStore.getState().boardShip();
      return;
    }

    // Minecraft-style cubic look sensitivity (radians per pixel), shared by
    // mouse, touch drag, and gamepad look (all three write into the same
    // voxelInput.look). Pitch never rolls — only yaw + clamped pitch are
    // applied. Respects "Invert pitch" the same way flight input does
    // (shipInput.ts) — previously only flight honoured that setting.
    const ms = cfg.mouseSensitivity;
    const look = consumeLook();
    const dy = cfg.invertPitch ? -look.dy : look.dy;
    player.yaw -= cubicLook(look.dx, ms);
    player.pitch = Math.max(
      -PITCH_LIMIT,
      Math.min(PITCH_LIMIT, player.pitch - cubicLook(dy, ms)),
    );

    // Continuous hold-to-mine at the crosshair (touch Dig / left mouse / RT).
    api.mineTick(Math.min(dt, 0.05), voxelInput.mine);
    // Edge-triggered placement of the active buildable (one per tap).
    if (consumePlace()) api.place();

    player.update(
      Math.min(dt, 0.05),
      { move: voxelInput.move, jump: voxelInput.jump, run: voxelInput.run },
      phys,
      api.isSolid,
      api.isLiquid,
    );

    euler.set(player.pitch, player.yaw, 0);
    camera.quaternion.setFromEuler(euler);
    camera.position.set(player.pos.x, player.eyeY(), player.pos.z);

    voxelTelemetry.x = player.pos.x;
    voxelTelemetry.y = player.pos.y;
    voxelTelemetry.z = player.pos.z;
    voxelTelemetry.yaw = player.yaw;
    voxelTelemetry.underwater = api.isLiquid(
      Math.floor(player.pos.x),
      Math.floor(player.eyeY()),
      Math.floor(player.pos.z),
    );

    // Walk-over pickup of overflow drops on this body (only when there's space).
    const st = useStore.getState();
    const px = player.pos.x;
    const py = player.pos.y;
    const pz = player.pos.z;
    const now = Date.now();
    if (st.drops.length > 0) {
      for (const d of st.drops) {
        if (d.planet !== planet) continue;
        if (d.noPickupUntil && d.noPickupUntil > now) continue; // pickup grace
        const dx = d.pos[0] - px;
        const dy = d.pos[1] - py;
        const dz = d.pos[2] - pz;
        if (dx * dx + dy * dy + dz * dz < PICKUP_RANGE_SQ) st.collectDrop(d.id);
      }
    }

    // Silos: pull in nearby ground drops + deposit affordance. Stations: expose
    // a craft affordance when the player is close enough.
    let siloNear = -1;
    let siloNearSq = DEPOSIT_SQ;
    let stationNear = -1;
    let stationNearSq = CRAFT_SQ;
    for (const s of st.structures) {
      if (s.planet !== planet) continue;
      const sx = s.pos[0] - px;
      const sy = s.pos[1] - py;
      const sz = s.pos[2] - pz;
      const sq = sx * sx + sy * sy + sz * sz;
      if (s.type === 'station') {
        if (sq < stationNearSq) {
          stationNearSq = sq;
          stationNear = s.id;
        }
        continue; // stations don't store/absorb
      }
      // habitat/solar/wind/thermal/refinery don't store; extractor/condenser
      // reuse the silo affordance so the player can collect what they've
      // passively produced without having to mine the structure.
      if (s.type !== 'silo' && s.type !== 'extractor' && s.type !== 'condenser') continue;
      if (sq < siloNearSq) {
        siloNearSq = sq;
        siloNear = s.id;
      }
      for (const d of st.drops) {
        if (d.planet !== planet) continue;
        if (d.noPickupUntil && d.noPickupUntil > now) continue; // pickup grace
        const ddx = d.pos[0] - s.pos[0];
        const ddy = d.pos[1] - s.pos[1];
        const ddz = d.pos[2] - s.pos[2];
        if (ddx * ddx + ddy * ddy + ddz * ddz < SILO_ABSORB_SQ) {
          st.absorbDropIntoSilo(s.id, d.id);
        }
      }
    }
    voxelSilo.available = siloNear >= 0;
    voxelSilo.id = siloNear;
    voxelStation.available = stationNear >= 0;
    voxelStation.id = stationNear;
    if (consumeDeposit() && siloNear >= 0) st.depositToStructure(siloNear);

    // Refineries + extractors/condensers: background simulation, throttled to
    // ~1 cycle/second so it doesn't hammer the store every frame. extractTick
    // gets the real elapsed time since the last cycle so its rate integrates
    // correctly even if a frame hitch delays a cycle past 1s.
    refineAcc.current += dt;
    if (refineAcc.current >= 1) {
      const elapsed = refineAcc.current;
      refineAcc.current = 0;
      st.refineTick(planet);
      st.extractTick(planet, elapsed);
    }

    // --- Phase 11.4 survival: oxygen / tethers / death ---------------------
    // Entirely inert in creative mode (the default): no drain, no warnings,
    // no audio, no store writes beyond the one reset on mode transition.
    if (st.creativeMode) {
      wasCreative.current = true;
    } else {
      const sdt = Math.min(dt, 0.05);
      if (wasCreative.current) {
        // Just entered survival: start on a full supply, clean warning state.
        wasCreative.current = false;
        o2.current = O2_MAX_SECONDS;
        warnedHalf.current = false;
        warnedLow.current = false;
      }

      const safety = computeSafety(st.structures, planet, shipPos, px, py, pz);
      if (safety.safe) {
        o2.current = Math.min(O2_MAX_SECONDS, o2.current + sdt * O2_REFILL_RATE);
      } else {
        o2.current = Math.max(0, o2.current - sdt);
      }
      const frac = o2.current / O2_MAX_SECONDS;

      // Tiered warnings: one cue crossing 50%, an urgent one crossing 25%
      // (which is exactly the final ~60 seconds), then a heartbeat that
      // quickens/loudens until death. Flags re-arm once the supply recovers.
      if (frac <= O2_WARN_HALF && !warnedHalf.current) {
        warnedHalf.current = true;
        audio.playOxygenWarning(false);
      } else if (frac > O2_WARN_HALF) {
        warnedHalf.current = false;
      }
      if (frac <= O2_WARN_LOW && !warnedLow.current) {
        warnedLow.current = true;
        audio.playOxygenWarning(true);
      } else if (frac > O2_WARN_LOW) {
        warnedLow.current = false;
      }
      if (frac <= O2_WARN_LOW && frac > 0 && !safety.safe) {
        heartbeat.current += sdt;
        const period = 0.6 + 0.5 * (frac / O2_WARN_LOW); // quickens toward 0
        if (heartbeat.current >= period) {
          heartbeat.current = 0;
          audio.playHeartbeat(1 - frac / O2_WARN_LOW);
        }
      }

      // Death: black out, wake at the nearest powered habitat (else the ship)
      // with everything kept — the setback is the walk, not lost progress. The
      // overlay explains exactly why it happened and how far safety was.
      if (o2.current <= 0) {
        const anchor = respawnAnchor(st.structures, planet, shipPos, px, py, pz);
        const dist = Number.isFinite(safety.nearestDist) ? Math.round(safety.nearestDist) : 0;
        player.spawnAt(new Vector3(anchor.pos[0], anchor.pos[1], anchor.pos[2]));
        o2.current = O2_MAX_SECONDS;
        warnedHalf.current = false;
        warnedLow.current = false;
        st.setSurvivalDeath({ dist, anchor: anchor.kind });
      }

      // Mirror a throttled fraction into the store for the HUD meter (4 Hz).
      o2Hud.current += sdt;
      if (o2Hud.current >= 0.25) {
        o2Hud.current = 0;
        if (Math.abs(st.oxygen - frac) > 0.002) st.setOxygen(frac);
        if (st.oxygenSafe !== safety.safe) st.setOxygenSafe(safety.safe);
      }
    }

    // Footsteps: accrue ground distance, fire one per stride with the material
    // of the block underfoot.
    if (player.onGround) {
      const sp = Math.hypot(player.vel.x, player.vel.z);
      stride.current += sp * Math.min(dt, 0.05);
      if (stride.current > 2.2) {
        stride.current = 0;
        const fx = Math.floor(player.pos.x);
        const fy = Math.floor(player.pos.y - 0.95);
        const fz = Math.floor(player.pos.z);
        audio.playFootstep(footstepFor(api.blockAt(fx, fy, fz)));
      }
    } else {
      stride.current = 0;
    }

    // Underground swell: how far the eye sits below the surface column.
    const top = surfaceHeightAt(player.pos.x, player.pos.z, terrain, seed);
    const cave = Math.max(0, Math.min(1, (top - player.eyeY() + 2) / 10));
    if (Math.abs(cave - lastCave.current) > 0.04) {
      lastCave.current = cave;
      audio.setCaveAmount(cave);
    }
  });

  return null;
}

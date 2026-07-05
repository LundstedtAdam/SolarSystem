import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferGeometry,
  BufferAttribute,
  Points,
  PointsMaterial,
  AdditiveBlending,
  Vector3,
  type Material,
} from 'three/webgpu';
import { useStore } from '../store';
import { QUALITY } from '../systems/quality';
import { shipTelemetry } from '../ship/shipTelemetry';
import { audio } from '../audio/AudioManager';

/** Engine exhaust offset behind the ship's local origin (see ShipModel.tsx's
 *  ~1.2-unit target length). */
const EXHAUST_OFFSET = 0.7;
const SPAWN_RATE_MAX = 90; // particles/sec at full throttle
const SPEED_ALONG = 6; // how fast a puff drifts backward, world units/sec
const SPREAD = 0.35;
const LIFE_MIN = 0.35;
const LIFE_MAX = 0.7;

interface TrailParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
}

const _forward = new Vector3();
const _pos = new Vector3();
const _jitter = new Vector3();

/**
 * Pooled engine-exhaust particle trail, spawn rate tied to throttle (reads
 * the same hot-path `shipTelemetry` singleton the camera/HUD already read —
 * no store subscription, no per-frame re-render). Mirrors the swap-remove,
 * fixed-cap pooling pattern already used for voxel mining debris
 * (`ChunkManager.tsx`'s `Debris[]`/`updateDebris`).
 */
export function ShipTrail() {
  const maxCount = QUALITY[useStore((s) => s.quality)].shipTrailParticles;
  const sceneModeType = useStore((s) => s.sceneMode.type);

  const built = useMemo(() => {
    if (maxCount === 0) return null;
    const positions = new Float32Array(maxCount * 3);
    const colors = new Float32Array(maxCount * 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    const material = new PointsMaterial({
      size: 1.1,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    return { points: new Points(geometry, material), positions, colors };
  }, [maxCount]);

  useEffect(() => {
    return () => {
      if (!built) return;
      built.points.geometry.dispose();
      (built.points.material as Material).dispose();
    };
  }, [built]);

  const particles = useRef<TrailParticle[]>([]);
  const spawnAcc = useRef(0);

  // Leaving piloting: drop the trail immediately rather than let it hang
  // frozen in space over the descent/ascent/solar-view scenes, and fade the
  // engine hum out.
  useEffect(() => {
    if (sceneModeType !== 'piloting') {
      particles.current.length = 0;
      audio.setEngineHum(0);
    }
  }, [sceneModeType]);

  useFrame((_, delta) => {
    if (sceneModeType !== 'piloting') return;
    // Engine hum tracks throttle regardless of the particle-trail quality
    // tier (audio is cheap, unlike the pooled particles it sits alongside).
    audio.setEngineHum(shipTelemetry.throttle);
    if (!built) return;
    const dt = Math.min(delta, 0.05);
    const throttle = shipTelemetry.throttle;
    const list = particles.current;

    // Spawn new puffs behind the ship, rate scaled by throttle.
    spawnAcc.current += SPAWN_RATE_MAX * throttle * dt;
    _forward.set(0, 0, -1).applyQuaternion(shipTelemetry.rotation);
    _pos.copy(shipTelemetry.position).addScaledVector(_forward, -EXHAUST_OFFSET);
    while (spawnAcc.current >= 1 && list.length < maxCount) {
      spawnAcc.current -= 1;
      _jitter.set(
        (Math.random() - 0.5) * SPREAD,
        (Math.random() - 0.5) * SPREAD,
        (Math.random() - 0.5) * SPREAD,
      );
      list.push({
        x: _pos.x + _jitter.x,
        y: _pos.y + _jitter.y,
        z: _pos.z + _jitter.z,
        vx: -_forward.x * SPEED_ALONG + _jitter.x,
        vy: -_forward.y * SPEED_ALONG + _jitter.y,
        vz: -_forward.z * SPEED_ALONG + _jitter.z,
        life: 0,
        max: LIFE_MIN + Math.random() * (LIFE_MAX - LIFE_MIN),
      });
    }
    if (spawnAcc.current > 1) spawnAcc.current = 1; // avoid a stall's backlog bursting all at once

    // Integrate + swap-remove expired puffs.
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life += dt;
      if (p.life >= p.max) {
        list[i] = list[list.length - 1];
        list.pop();
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }

    // Write into the shared buffers; unused slots collapse to black so
    // additive blending contributes nothing for them (Points has no simple
    // per-vertex visibility toggle).
    const { positions, colors } = built;
    for (let i = 0; i < maxCount; i++) {
      const p = list[i];
      const o = i * 3;
      if (p) {
        const fade = 1 - p.life / p.max;
        positions[o] = p.x;
        positions[o + 1] = p.y;
        positions[o + 2] = p.z;
        colors[o] = 0.5 * fade;
        colors[o + 1] = 0.65 * fade;
        colors[o + 2] = 1.0 * fade;
      } else {
        colors[o] = colors[o + 1] = colors[o + 2] = 0;
      }
    }
    const posAttr = built.points.geometry.attributes.position as BufferAttribute;
    const colorAttr = built.points.geometry.attributes.color as BufferAttribute;
    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
  });

  if (!built) return null;
  return <primitive object={built.points} />;
}

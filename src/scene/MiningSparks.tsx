import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferGeometry,
  BufferAttribute,
  Points,
  PointsMaterial,
  AdditiveBlending,
  type Material,
} from 'three/webgpu';
import { useStore } from '../store';
import { QUALITY } from '../systems/quality';
import { miningSparkRuntime } from './miningSparkRuntime';

/**
 * Pooled impact-chip sparks — a brief, bright burst at the hit point every
 * time a mining shot connects, whether or not the hit fractures the target
 * (fracture debris is a separate, rarer, longer-lived population in
 * `AsteroidDebris.tsx`). Same pooled-Points pattern as `ShipTrail.tsx`.
 */
export function MiningSparks() {
  const maxCount = QUALITY[useStore((s) => s.quality)].miningVfxBudget;
  const sceneModeType = useStore((s) => s.sceneMode.type);

  const built = useMemo(() => {
    if (maxCount === 0) return null;
    const positions = new Float32Array(maxCount * 3);
    const colors = new Float32Array(maxCount * 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    const material = new PointsMaterial({
      size: 0.5,
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

  useEffect(() => {
    if (sceneModeType !== 'piloting') miningSparkRuntime.list.length = 0;
  }, [sceneModeType]);

  useEffect(() => {
    miningSparkRuntime.maxCount = maxCount;
  }, [maxCount]);

  useFrame((_, delta) => {
    if (!built) return;
    if (sceneModeType !== 'piloting') return;
    const dt = Math.min(delta, 0.05);
    const list = miningSparkRuntime.list;

    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        list[i] = list[list.length - 1];
        list.pop();
        continue;
      }
      p.pos.addScaledVector(p.vel, dt);
    }

    const { positions, colors } = built;
    for (let i = 0; i < maxCount; i++) {
      const p = list[i];
      const o = i * 3;
      if (p) {
        const fade = 1 - p.life / p.maxLife;
        positions[o] = p.pos.x;
        positions[o + 1] = p.pos.y;
        positions[o + 2] = p.pos.z;
        colors[o] = 1.0 * fade;
        colors[o + 1] = 0.6 * fade;
        colors[o + 2] = 0.25 * fade;
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

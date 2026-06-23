import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useStore } from '../store';
import { PLANETS } from '../systems/bodies';
import { labelEls } from './labelRegistry';

/**
 * Projects each planet's world position to screen space and positions the
 * matching DOM label (in the overlay) directly — a robust replacement for
 * drei <Html>, which doesn't mount under this WebGPU setup.
 */
export function LabelProjector() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const v = useRef(new Vector3());

  useFrame(() => {
    if (!useStore.getState().showLabels) return;
    const objs = useStore.getState().planetObjects;
    for (const p of PLANETS) {
      const el = labelEls[p.name];
      const obj = objs[p.name];
      if (!el || !obj) continue;
      obj.getWorldPosition(v.current);
      // Offset the label a little above the body, then project to NDC.
      v.current.project(camera);
      const onScreen = v.current.z < 1 && Math.abs(v.current.x) <= 1 && Math.abs(v.current.y) <= 1;
      if (!onScreen) {
        el.style.opacity = '0';
        continue;
      }
      const x = (v.current.x * 0.5 + 0.5) * size.width;
      const y = (-v.current.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate(-50%, -140%) translate(${x}px, ${y}px)`;
      el.style.opacity = '1';
    }
  });

  return null;
}

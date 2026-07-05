import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { getBiome } from '../terrain/biomes';

// A brief full-screen wash in the body's sky colour when stepping between the
// Phase 8 surface and the voxel world, so the swap reads as an atmospheric
// continuation rather than a hard cut while the first chunks stream in. Skipped
// entirely when the user prefers reduced motion.
export function VoxelTransition() {
  const sceneMode = useStore((s) => s.sceneMode);
  const reduced = useStore((s) => s.reducedMotion);
  const [opacity, setOpacity] = useState(0);
  const [color, setColor] = useState('#000');
  const prevType = useRef(sceneMode.type);

  useEffect(() => {
    const was = prevType.current;
    prevType.current = sceneMode.type;
    if (reduced) return;

    const crossingFoot =
      sceneMode.type === 'voxel' || was === 'voxel';
    if (!crossingFoot) return;

    const planet =
      sceneMode.type === 'voxel' || sceneMode.type === 'surface' ? sceneMode.planet : '';
    const [r, g, b] = getBiome(planet).skyHorizon;
    setColor(`rgb(${(r * 255) | 0}, ${(g * 255) | 0}, ${(b * 255) | 0})`);

    // Flash to opaque, then fade out via the CSS transition.
    setOpacity(1);
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setOpacity(0)),
    );
    return () => cancelAnimationFrame(id);
  }, [sceneMode, reduced]);

  return (
    <div
      className="voxel-transition"
      style={{ opacity, backgroundColor: color, pointerEvents: 'none' }}
      aria-hidden="true"
    />
  );
}

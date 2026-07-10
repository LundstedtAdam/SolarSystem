import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { spaceMiningTelemetry } from '../ship/spaceMiningTelemetry';

/** Space-flight aiming reticle. Reflects `spaceMiningTelemetry.aiming` — set
 *  every frame by `SpaceMiningController.tsx` regardless of whether the
 *  player is firing — so the crosshair highlights on a targetable asteroid
 *  the moment it's in range, matching the genre convention of an aim-assist
 *  reticle (Freelancer/Elite-style) rather than staying inert until fired.
 *  Polled at 100ms, mirroring the same non-reactive-singleton-into-React-
 *  state pattern already used for the voxel scan button
 *  (`VoxelTouchControls.tsx`'s `voxelScan.available` polling). */
export function SpaceCrosshair() {
  const sceneModeType = useStore((s) => s.sceneMode.type);
  const [onTarget, setOnTarget] = useState(false);

  useEffect(() => {
    if (sceneModeType !== 'piloting') return;
    const id = setInterval(() => setOnTarget(spaceMiningTelemetry.aiming), 100);
    return () => clearInterval(id);
  }, [sceneModeType]);

  if (sceneModeType !== 'piloting') return null;

  return <div className={`space-crosshair${onTarget ? ' on-target' : ''}`} aria-hidden="true" />;
}

import { useEffect, useState } from 'react';
import { Vector3 } from 'three';
import { useStore } from '../store';
import { useT } from '../i18n';
import { resolveDescentTarget } from '../descent/descentHelpers';
import { archetypeFor } from '../voxel/voxelBiomes';
import { getBodyResources, RESOURCE_LABEL } from '../voxel/resourceProfiles';
import { ORE_TO_RESOURCE } from '../voxel/voxelTypes';

/** Orbital scanner (Phase 11.5) — a resource readout while still in orbit,
 *  reusing the same per-archetype vein table worldGen places into terrain, so
 *  the promise always matches what's actually diggable. Biome-specific veins
 *  only (skip the 3 universal fundamentals — every body has those, so listing
 *  them tells the player nothing new). */
function orbitalScanReadout(planet: string): string | null {
  const veins = getBodyResources(archetypeFor(planet)).slice(3);
  const names = veins
    .map((v) => ORE_TO_RESOURCE[v.block])
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => RESOURCE_LABEL[r]);
  return names.length > 0 ? names.join(', ') : null;
}

export function DescentOverlay() {
  const sceneMode = useStore((s) => s.sceneMode);
  const abortDescent = useStore((s) => s.abortDescent);
  const shipPosition = useStore((s) => s.shipPosition);
  const simTimeDays = useStore((s) => s.simTimeDays);
  const scannerTier = useStore((s) => s.shipUpgrades.scanner);
  const { name } = useT();
  const [isGasGiant, setIsGasGiant] = useState(false);

  useEffect(() => {
    if (sceneMode.type !== 'descending') {
      setIsGasGiant(false);
      return;
    }
    const t = resolveDescentTarget(sceneMode.target, simTimeDays);
    if (t) setIsGasGiant(t.isGasGiant);
  }, [sceneMode, simTimeDays]);

  if (sceneMode.type !== 'descending') return null;

  const target = resolveDescentTarget(sceneMode.target, simTimeDays);
  const altitude = target
    ? new Vector3(...shipPosition).distanceTo(target.worldPos).toFixed(0)
    : '---';

  const phaseLabel =
    sceneMode.phase === 'orbit'
      ? 'ORBITAL APPROACH'
      : sceneMode.phase === 'atmosphere'
        ? 'ATMOSPHERIC ENTRY'
        : 'LANDING';

  return (
    <div className="descent-overlay">
      <div className="descent-overlay-info" style={{
        color: isGasGiant ? '#ff4444' : 'rgba(255,255,255,0.9)',
      }}>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 2 }}>
          {name(sceneMode.target).toUpperCase()}
        </div>
        {isGasGiant ? (
          <div style={{ fontWeight: 'bold', fontSize: 16 }}>
            UNABLE TO LAND — GAS GIANT
          </div>
        ) : (
          <>
            <div style={{ fontWeight: 'bold' }}>{phaseLabel}</div>
            <div style={{ fontSize: 12, marginTop: 2 }}>ALT {altitude}</div>
            {sceneMode.phase === 'orbit' && scannerTier > 0 && (() => {
              const readout = orbitalScanReadout(sceneMode.target);
              return readout ? (
                <div style={{ fontSize: 11, marginTop: 6, color: '#8fd6ff' }}>
                  ORBITAL SCAN: {readout} signatures detected
                </div>
              ) : null;
            })()}
          </>
        )}
      </div>

      {sceneMode.phase === 'atmosphere' && !isGasGiant && (
        <div className="descent-overlay-heat" />
      )}

      <button className="button descent-overlay-abort" onClick={abortDescent}>
        <span className="actual-text">&nbsp;Abort&nbsp;</span>
        <span aria-hidden="true" className="hover-text">&nbsp;Abort&nbsp;</span>
      </button>
    </div>
  );
}

import { useStore } from '../store';

// On-foot HUD for the voxel world (sub-phase 9.0): identifies the body and
// offers a clear way back to the ship, which returns to the Phase 8 surface
// view from where the player can Launch. Minimap/compass arrive in 9.6.
export function VoxelHUD() {
  const sceneMode = useStore((s) => s.sceneMode);
  const boardShip = useStore((s) => s.boardShip);

  if (sceneMode.type !== 'voxel') return null;

  return (
    <div className="surface-hud">
      <div className="surface-hud-top">
        <div className="surface-hud-name">{sceneMode.planet.toUpperCase()} — ON FOOT</div>
      </div>

      <div className="surface-hud-actions">
        <button className="button surface-hud-action" onClick={boardShip}>
          <span className="actual-text">&nbsp;Board ship&nbsp;</span>
          <span aria-hidden="true" className="hover-text">&nbsp;Board ship&nbsp;</span>
        </button>
      </div>
    </div>
  );
}

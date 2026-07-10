import { useEffect } from 'react';
import { useStore } from './store';
import { loadInventory, loadItems, loadSeen, loadMode, loadUpgrades, loadActiveTool, loadFlashlightOn } from './voxel/persistence';
import { DEFAULT_UPGRADES, type ShipUpgrades } from './ship/upgrades';
import { SolarSystem } from './scene/SolarSystem';
import { HUD } from './ui/HUD';
import { InfoPanel } from './ui/InfoPanel';
import { Loading } from './ui/Loading';
import { Controls } from './ui/Controls';
import { Audio } from './ui/Audio';
import { SurfaceAudio } from './audio/SurfaceAudio';
import { VoxelAudio } from './audio/VoxelAudio';
import { SettingsPanel } from './ui/SettingsPanel';
import { Labels } from './ui/Labels';
import { ShipHUD } from './ui/ShipHUD';
import { SpaceCrosshair } from './ui/SpaceCrosshair';
import { DescentOverlay } from './ui/DescentOverlay';
import { SurfaceHUD } from './ui/SurfaceHUD';
import { VoxelHUD } from './ui/VoxelHUD';
import { DiscoveryPanel } from './ui/DiscoveryPanel';
import { VoxelTransition } from './ui/VoxelTransition';
import { VoxelTouchControls } from './ui/VoxelTouchControls';
import { TouchControls } from './ui/TouchControls';
import { ControlHints } from './ui/ControlHints';

export default function App() {
  // Restore the persisted backpack once on load (voxel edits load per-body in
  // the ChunkManager). Body edits + inventory are saved on leaving a surface
  // and when the tab is hidden.
  useEffect(() => {
    loadInventory().then((inv) => {
      if (inv) useStore.getState().setInventory(inv);
    });
    loadItems().then((items) => {
      if (items) useStore.getState().setItems(items);
    });
    loadSeen().then((seen) => {
      if (seen) useStore.getState().setSeenResources(seen);
    });
    loadMode().then((mode) => {
      // Only apply an explicit saved choice; the in-memory default is creative.
      if (mode) useStore.getState().setCreativeMode(mode.creative);
    });
    loadUpgrades().then((saved) => {
      if (saved) useStore.getState().setShipUpgrades({ ...DEFAULT_UPGRADES, ...saved } as ShipUpgrades);
    });
    loadActiveTool().then((tool) => {
      if (tool) useStore.getState().setActiveTool(tool);
    });
    loadFlashlightOn().then((on) => {
      if (on) useStore.getState().setFlashlightOn(on);
    });
  }, []);

  return (
    <>
      <SolarSystem />
      <Labels />
      <HUD />
      <InfoPanel />
      <SettingsPanel />
      <ShipHUD />
      <SpaceCrosshair />
      <DescentOverlay />
      <SurfaceHUD />
      <VoxelHUD />
      <DiscoveryPanel />
      <VoxelTransition />
      <VoxelTouchControls />
      <TouchControls />
      <ControlHints />
      <Loading />
      <Controls />
      <Audio />
      <SurfaceAudio />
      <VoxelAudio />
    </>
  );
}

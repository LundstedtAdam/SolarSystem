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
import { DescentOverlay } from './ui/DescentOverlay';
import { SurfaceHUD } from './ui/SurfaceHUD';
import { VoxelHUD } from './ui/VoxelHUD';
import { DiscoveryPanel } from './ui/DiscoveryPanel';
import { VoxelTransition } from './ui/VoxelTransition';
import { VoxelTouchControls } from './ui/VoxelTouchControls';
import { TouchControls } from './ui/TouchControls';

export default function App() {
  return (
    <>
      <SolarSystem />
      <Labels />
      <HUD />
      <InfoPanel />
      <SettingsPanel />
      <ShipHUD />
      <DescentOverlay />
      <SurfaceHUD />
      <VoxelHUD />
      <DiscoveryPanel />
      <VoxelTransition />
      <VoxelTouchControls />
      <TouchControls />
      <Loading />
      <Controls />
      <Audio />
      <SurfaceAudio />
      <VoxelAudio />
    </>
  );
}

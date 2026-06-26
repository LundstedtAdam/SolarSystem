import { SolarSystem } from './scene/SolarSystem';
import { HUD } from './ui/HUD';
import { InfoPanel } from './ui/InfoPanel';
import { Loading } from './ui/Loading';
import { Controls } from './ui/Controls';
import { Audio } from './ui/Audio';
import { SurfaceAudio } from './audio/SurfaceAudio';
import { BodyPicker } from './ui/BodyPicker';
import { SettingsPanel } from './ui/SettingsPanel';
import { Labels } from './ui/Labels';
import { ShipHUD } from './ui/ShipHUD';
import { DescentOverlay } from './ui/DescentOverlay';
import { SurfaceHUD } from './ui/SurfaceHUD';
import { VoxelHUD } from './ui/VoxelHUD';
import { VoxelTouchControls } from './ui/VoxelTouchControls';
import { TouchControls } from './ui/TouchControls';

export default function App() {
  return (
    <>
      <SolarSystem />
      <Labels />
      <HUD />
      <BodyPicker />
      <InfoPanel />
      <SettingsPanel />
      <ShipHUD />
      <DescentOverlay />
      <SurfaceHUD />
      <VoxelHUD />
      <VoxelTouchControls />
      <TouchControls />
      <Loading />
      <Controls />
      <Audio />
      <SurfaceAudio />
    </>
  );
}

import { SolarSystem } from './scene/SolarSystem';
import { HUD } from './ui/HUD';
import { InfoPanel } from './ui/InfoPanel';
import { Loading } from './ui/Loading';
import { Controls } from './ui/Controls';
import { Audio } from './ui/Audio';
import { BodyPicker } from './ui/BodyPicker';
import { SettingsPanel } from './ui/SettingsPanel';
import { Labels } from './ui/Labels';

export default function App() {
  return (
    <>
      <SolarSystem />
      <Labels />
      <HUD />
      <BodyPicker />
      <InfoPanel />
      <SettingsPanel />
      <Loading />
      <Controls />
      <Audio />
    </>
  );
}

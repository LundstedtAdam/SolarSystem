import { SolarSystem } from './scene/SolarSystem';
import { HUD } from './ui/HUD';
import { InfoPanel } from './ui/InfoPanel';
import { Loading } from './ui/Loading';
import { Controls } from './ui/Controls';
import { Audio } from './ui/Audio';

export default function App() {
  return (
    <>
      <SolarSystem />
      <HUD />
      <InfoPanel />
      <Loading />
      <Controls />
      <Audio />
    </>
  );
}

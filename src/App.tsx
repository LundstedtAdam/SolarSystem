import { SolarSystem } from './scene/SolarSystem';
import { HUD } from './ui/HUD';
import { InfoPanel } from './ui/InfoPanel';
import { Loading } from './ui/Loading';
import { Controls } from './ui/Controls';

export default function App() {
  return (
    <>
      <SolarSystem />
      <HUD />
      <InfoPanel />
      <Loading />
      <Controls />
    </>
  );
}

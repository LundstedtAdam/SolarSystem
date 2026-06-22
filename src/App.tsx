import { SolarSystem } from './scene/SolarSystem';
import { HUD } from './ui/HUD';
import { InfoPanel } from './ui/InfoPanel';
import { Loading } from './ui/Loading';

export default function App() {
  return (
    <>
      <SolarSystem />
      <HUD />
      <InfoPanel />
      <Loading />
    </>
  );
}

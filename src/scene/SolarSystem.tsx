import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Starfield } from './Starfield';
import { Sun } from './Sun';
import { Orbits } from './Orbits';
import { Planet } from './Planet';
import { CameraRig } from '../camera/CameraRig';
import { PLANETS } from '../systems/bodies';

/** The 3D scene: starfield, sun, planets/moons, orbit lines, and camera rig. */
export function SolarSystem() {
  return (
    <Canvas
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh' }}
      camera={{ fov: 75, near: 1, far: 20000, position: [0, 200, 500] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      dpr={[1, 2]}
    >
      <Suspense fallback={null}>
        <ambientLight color={0x404040} />
        <Starfield />
        <Sun />
        <Orbits />
        {PLANETS.map((p) => (
          <Planet key={p.name} data={p} />
        ))}
      </Suspense>
      <CameraRig />
    </Canvas>
  );
}

import { Suspense, useCallback, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { AmbientLight, PointLight } from 'three';
import {
  WebGPURenderer,
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  AmbientLightNode,
  PointLightNode,
} from 'three/webgpu';
import { Starfield } from './Starfield';
import { Sun } from './Sun';
import { SolarWind } from './SolarWind';
import { AsteroidBelt } from './AsteroidBelt';
import { SimClock } from './SimClock';
import { AudioReactor } from './AudioReactor';
import { LabelProjector } from './LabelProjector';
import { Orbits } from './Orbits';
import { Planet } from './Planet';
import { CameraRig } from '../camera/CameraRig';
import { ShipController } from '../ship/ShipController';
import { ShipCamera } from '../ship/ShipCamera';
import { DescentManager } from '../descent/DescentManager';
import { DescentCamera } from '../descent/DescentCamera';
import { AscentManager } from '../descent/AscentManager';
import { AscentCamera } from '../descent/AscentCamera';
import { Effects } from '../postfx/Effects';
import { PLANETS } from '../systems/bodies';
import { useStore, type SceneMode } from '../store';
import { QUALITY } from '../systems/quality';

/** The 3D scene rendered with a WebGPU renderer (auto WebGL2 fallback). */
export function SolarSystem() {
  // R3F (v8) can't await an async renderer, and WebGPURenderer must finish
  // init() before it can render. So we start with the loop paused and flip it
  // to "always" once init resolves.
  const [frameloop, setFrameloop] = useState<'never' | 'always'>('never');
  const dprMax = QUALITY[useStore((s) => s.quality)].dprMax;
  const sceneMode: SceneMode = useStore((s) => s.sceneMode);

  const createRenderer = useCallback((canvas: HTMLCanvasElement) => {
    const renderer = new WebGPURenderer({ canvas, antialias: true });
    // R3F instantiates lights from the classic three build; register those
    // classes with the WebGPU node library (it keys handlers by light class)
    // so the renderer lights the scene instead of warning "Light node not found".
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const library = (renderer as any).nodes.library;
    library.addLight(AmbientLightNode, AmbientLight);
    library.addLight(PointLightNode, PointLight);
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    renderer
      .init()
      .then(() => setFrameloop('always'))
      .catch((err) => console.error('WebGPU init failed:', err));
    return renderer;
  }, []);

  return (
    <Canvas
      frameloop={frameloop}
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh' }}
      camera={{ fov: 75, near: 1, far: 20000, position: [0, 200, 500] }}
      gl={createRenderer as never}
      dpr={[1, dprMax]}
    >
      <Suspense fallback={null}>
        {/* Faint cool fill so night sides aren't pure black; the sun point
            light is the key light and defines the day/night terminator. */}
        <ambientLight intensity={0.04} color={0x2a3358} />
        <Starfield />
        <Sun />
        <SolarWind />
        <AsteroidBelt />
        <Orbits />
        {PLANETS.map((p) => (
          <Planet key={p.name} data={p} />
        ))}
      </Suspense>
      <SimClock />
      <AudioReactor />
      <LabelProjector />
      {sceneMode.type === 'solar' && <CameraRig />}
      {sceneMode.type === 'piloting' && (
        <>
          <ShipController />
          <ShipCamera />
        </>
      )}
      {sceneMode.type === 'descending' && (
        <>
          <ShipController />
          <DescentManager />
          <DescentCamera />
        </>
      )}
      {sceneMode.type === 'ascending' && (
        <>
          <ShipController />
          <AscentManager />
          <AscentCamera />
        </>
      )}
      <Effects />
    </Canvas>
  );
}

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
import { SurfaceScene } from '../terrain/SurfaceScene';
import { VoxelScene } from '../voxel/VoxelScene';
import { Effects } from '../postfx/Effects';
import { PLANETS, WORLD_SCALE } from '../systems/bodies';
import { useStore, type SceneMode } from '../store';
import { QUALITY } from '../systems/quality';
import { useT } from '../i18n';

/** The 3D scene rendered with a WebGPU renderer (auto WebGL2 fallback). */
export function SolarSystem() {
  // R3F (v8) can't await an async renderer, and WebGPURenderer must finish
  // init() before it can render. So we start with the loop paused and flip it
  // to "always" once init resolves.
  const [frameloop, setFrameloop] = useState<'never' | 'always'>('never');
  // Init rejection (no WebGPU *and* no WebGL2) previously left a silent black
  // screen — surface it as an explanatory overlay instead.
  const [initFailed, setInitFailed] = useState(false);
  const { t } = useT();
  const dprMax = QUALITY[useStore((s) => s.quality)].dprMax;
  const sceneMode: SceneMode = useStore((s) => s.sceneMode);
  const onSurface = sceneMode.type === 'surface';
  const onVoxel = sceneMode.type === 'voxel';
  // Both on-foot modes hide the space scene (planets, stars, sun, belts).
  const onGround = onSurface || onVoxel;

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
      .catch((err) => {
        console.error('WebGPU init failed:', err);
        setInitFailed(true);
      });
    return renderer;
  }, []);

  if (initFailed) {
    return (
      <div className="renderer-failed" role="alert">
        <div className="renderer-failed-inner">
          <h1>{t('rendererFailedTitle')}</h1>
          <p>{t('rendererFailedBody')}</p>
        </div>
      </div>
    );
  }

  return (
    <Canvas
      frameloop={frameloop}
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh' }}
      camera={{
        fov: 75,
        near: 0.5,
        far: 50000 * WORLD_SCALE,
        position: [0, 300 * WORLD_SCALE, 800 * WORLD_SCALE],
      }}
      gl={createRenderer as never}
      dpr={[1, dprMax]}
    >
      {!onGround && (
        <Suspense fallback={null}>
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
      )}
      <SimClock />
      <AudioReactor />
      {!onGround && <LabelProjector />}
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
      {onSurface && <SurfaceScene />}
      {onVoxel && <VoxelScene />}
      <Effects />
    </Canvas>
  );
}

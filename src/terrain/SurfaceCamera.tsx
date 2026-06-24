import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, type PerspectiveCamera } from 'three';
import { useStore } from '../store';

const _target = new Vector3();
// Close in on the ~1.2-unit ship so it reads as a vehicle on textured ground.
const SURFACE_HEIGHT = 1.5;
const CAM_DISTANCE = 6;

export function SurfaceCamera() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const initialized = useRef(false);

  useEffect(() => {
    camera.near = 0.1;
    camera.far = 2000;
    camera.fov = 70;
    camera.updateProjectionMatrix();
  }, [camera]);

  useFrame(() => {
    const store = useStore.getState();
    if (store.sceneMode.type !== 'surface') {
      initialized.current = false;
      return;
    }

    const [px, py, pz] = store.shipPosition;
    _target.set(px, py + SURFACE_HEIGHT, pz);

    if (!initialized.current) {
      camera.position.set(px + CAM_DISTANCE * 0.5, py + SURFACE_HEIGHT + 3, pz + CAM_DISTANCE);
      initialized.current = true;
    }

    camera.lookAt(_target);
    camera.updateProjectionMatrix();
  });

  return null;
}

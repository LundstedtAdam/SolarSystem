import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, type PerspectiveCamera } from 'three';
import { useStore } from '../store';

const _shipPos = new Vector3();
const _camPos = new Vector3();

export function AscentCamera() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const initialized = useRef(false);

  useFrame(() => {
    const store = useStore.getState();
    if (store.sceneMode.type !== 'ascending') {
      initialized.current = false;
      return;
    }

    _shipPos.set(...store.shipPosition);
    _camPos.set(_shipPos.x + 5, _shipPos.y + 8, _shipPos.z + 12);

    if (!initialized.current) {
      camera.position.copy(_camPos);
      initialized.current = true;
    } else {
      camera.position.lerp(_camPos, 0.04);
    }

    camera.lookAt(_shipPos);
    camera.fov = 75;
    camera.near = 0.1;
    camera.far = 50000;
    camera.updateProjectionMatrix();
  });

  return null;
}

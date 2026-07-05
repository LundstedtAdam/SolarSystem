import { beforeEach, describe, expect, it } from 'vitest';
import { useStore, DEFAULT_MOUSE_SENSITIVITY } from '../store';
import { addCameraLook, getCameraLook, resetCameraLook } from './cameraLook';
import { addStickInput, getStick, resetStick } from './virtualStick';

// Regression coverage for a real bug: the flight look code used to ignore the
// "Mouse/touch sensitivity" setting entirely (hardcoded gain constants), even
// though it's presented under "Flight controls" in the settings panel.

const initialState = useStore.getState();

beforeEach(() => {
  useStore.setState(initialState, true);
  resetCameraLook();
  resetStick();
});

describe('addCameraLook sensitivity scaling', () => {
  it('reproduces the original tuned feel at the default sensitivity', () => {
    addCameraLook(100, 0);
    expect(getCameraLook().yaw).toBeCloseTo(-0.5, 5); // -100 * 0.005 * (1.0 scale)
  });

  it('scales deflection proportionally with the sensitivity setting', () => {
    useStore.getState().setControls({ mouseSensitivity: DEFAULT_MOUSE_SENSITIVITY * 2 });
    addCameraLook(100, 0);
    expect(getCameraLook().yaw).toBeCloseTo(-1.0, 5);

    resetCameraLook();
    useStore.getState().setControls({ mouseSensitivity: DEFAULT_MOUSE_SENSITIVITY / 2 });
    addCameraLook(100, 0);
    expect(getCameraLook().yaw).toBeCloseTo(-0.25, 5);
  });
});

describe('addStickInput sensitivity scaling', () => {
  it('reproduces the original tuned feel at the default sensitivity', () => {
    addStickInput(10, 0);
    // stickX = 10 * 0.012 * 1.0 = 0.12; getStick().x applies the 0.6 yaw weight.
    expect(getStick().x).toBeCloseTo(0.12 * 0.6, 5);
  });

  it('scales deflection proportionally with the sensitivity setting', () => {
    useStore.getState().setControls({ mouseSensitivity: DEFAULT_MOUSE_SENSITIVITY * 2 });
    addStickInput(10, 0);
    expect(getStick().x).toBeCloseTo(0.24 * 0.6, 5);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../store';
import { readInput, setTouchRoll, setTouchJoystick, clearTouchJoystick, setTouchThrottle } from './shipInput';

const initialState = useStore.getState();

beforeEach(() => {
  useStore.setState(initialState, true);
  clearTouchJoystick();
  setTouchThrottle(0);
  setTouchRoll(0);
});

describe('touch roll input', () => {
  it('readInput reports zero roll with no touch roll input (regression: was hardcoded to 0 always)', () => {
    setTouchJoystick(0.3, 0);
    const input = readInput();
    expect(input.roll).toBe(0);
  });

  it('readInput reports a positive roll when the right (↻) touch button is held', () => {
    setTouchRoll(1);
    const input = readInput();
    expect(input.roll).toBeGreaterThan(0);
  });

  it('readInput reports a negative roll when the left (↺) touch button is held', () => {
    setTouchRoll(-1);
    const input = readInput();
    expect(input.roll).toBeLessThan(0);
  });

  it('roll alone (no joystick/throttle activity) is still routed through the touch input branch', () => {
    setTouchRoll(1);
    const input = readInput();
    // Touch branch produces throttleRaw derived from touchThrust (0 here);
    // the key behavior under test is that roll is honored even with no
    // joystick/throttle activity, not that the branch changes other fields.
    expect(input.roll).toBeGreaterThan(0);
    expect(input.thrust).toBe(0);
  });

  it('releasing the roll button returns roll to zero', () => {
    setTouchRoll(1);
    expect(readInput().roll).toBeGreaterThan(0);
    setTouchRoll(0);
    setTouchJoystick(0.3, 0); // keep the touch branch active via joystick instead
    expect(readInput().roll).toBe(0);
  });
});

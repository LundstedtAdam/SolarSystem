import { useRef, useCallback, useEffect } from 'react';
import { useStore } from '../store';
import { setTouchJoystick, clearTouchJoystick, setTouchThrottle } from '../ship/shipInput';

const JOYSTICK_SIZE = 120;
const DEAD_ZONE = 0.12;
const THROTTLE_HEIGHT = 160;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function Joystick() {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const touchId = useRef<number | null>(null);
  const center = useRef({ x: 0, y: 0 });

  const handleMove = useCallback((clientX: number, clientY: number) => {
    const r = JOYSTICK_SIZE / 2;
    let dx = (clientX - center.current.x) / r;
    let dy = (clientY - center.current.y) / r;
    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag > 1) { dx /= mag; dy /= mag; }
    if (Math.abs(dx) < DEAD_ZONE) dx = 0;
    if (Math.abs(dy) < DEAD_ZONE) dy = 0;

    if (knobRef.current) {
      knobRef.current.style.transform = `translate(${dx * r * 0.6}px, ${dy * r * 0.6}px)`;
    }
    setTouchJoystick(dx, dy);
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (touchId.current !== null) return;
    const touch = e.changedTouches[0];
    touchId.current = touch.identifier;
    const rect = baseRef.current!.getBoundingClientRect();
    center.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    handleMove(touch.clientX, touch.clientY);
  }, [handleMove]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchId.current) {
        handleMove(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
        break;
      }
    }
  }, [handleMove]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchId.current) {
        touchId.current = null;
        clearTouchJoystick();
        if (knobRef.current) knobRef.current.style.transform = 'translate(0,0)';
        break;
      }
    }
  }, []);

  return (
    <div
      ref={baseRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      style={{
        position: 'absolute',
        bottom: 40,
        left: 30,
        width: JOYSTICK_SIZE,
        height: JOYSTICK_SIZE,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.08)',
        border: '2px solid rgba(255,255,255,0.2)',
        touchAction: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        ref={knobRef}
        style={{
          width: JOYSTICK_SIZE * 0.4,
          height: JOYSTICK_SIZE * 0.4,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.25)',
          border: '2px solid rgba(255,255,255,0.4)',
          pointerEvents: 'none',
          transition: 'none',
        }}
      />
    </div>
  );
}

function ThrottleSlider() {
  const trackRef = useRef<HTMLDivElement>(null);
  const touchId = useRef<number | null>(null);

  const update = useCallback((clientY: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    const normalized = 1 - clamp((clientY - rect.top) / rect.height, 0, 1);
    setTouchThrottle(normalized);
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (touchId.current !== null) return;
    const touch = e.changedTouches[0];
    touchId.current = touch.identifier;
    update(touch.clientY);
  }, [update]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchId.current) {
        update(e.changedTouches[i].clientY);
        break;
      }
    }
  }, [update]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchId.current) {
        touchId.current = null;
        setTouchThrottle(0);
        break;
      }
    }
  }, []);

  return (
    <div
      ref={trackRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      style={{
        position: 'absolute',
        bottom: 40,
        right: 30,
        width: 44,
        height: THROTTLE_HEIGHT,
        borderRadius: 22,
        background: 'rgba(255,255,255,0.08)',
        border: '2px solid rgba(255,255,255,0.2)',
        touchAction: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 10,
          color: 'rgba(255,255,255,0.5)',
          padding: 4,
        }}
      >
        THR
      </div>
    </div>
  );
}

export function TouchControls() {
  const sceneMode = useStore((s) => s.sceneMode);

  useEffect(() => {
    return () => {
      clearTouchJoystick();
      setTouchThrottle(0);
    };
  }, []);

  if (sceneMode.type !== 'piloting') return null;

  const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  if (!isTouch) return null;

  return (
    <>
      <Joystick />
      <ThrottleSlider />
    </>
  );
}

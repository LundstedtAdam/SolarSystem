import { useRef, useCallback, useEffect, useState } from 'react';
import { useStore } from '../store';
import { setTouchJoystick, clearTouchJoystick, setTouchThrottle } from '../ship/shipInput';
import { addCameraLook, endCameraLook } from '../ship/cameraLook';

const JOYSTICK_SIZE = 120;
const AUTO_HIDE_MS = 3000;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function Joystick({ onActivity }: { onActivity: () => void }) {
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

    if (knobRef.current) {
      knobRef.current.style.transform = `translate(${dx * r * 0.6}px, ${dy * r * 0.6}px)`;
    }
    // Send the raw vector; dead zone + curve are applied centrally in shipInput.
    setTouchJoystick(dx, dy);
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (touchId.current !== null) return;
    const touch = e.changedTouches[0];
    touchId.current = touch.identifier;
    const rect = baseRef.current!.getBoundingClientRect();
    center.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    handleMove(touch.clientX, touch.clientY);
    onActivity();
  }, [handleMove, onActivity]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchId.current) {
        handleMove(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
        onActivity();
        break;
      }
    }
  }, [handleMove, onActivity]);

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
      className="touch-joystick"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div ref={knobRef} className="touch-joystick-knob" />
    </div>
  );
}

function ThrottleSlider({ onActivity }: { onActivity: () => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const touchId = useRef<number | null>(null);

  const update = useCallback((clientY: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    const normalized = 1 - clamp((clientY - rect.top) / rect.height, 0, 1);
    setTouchThrottle(normalized);
    if (fillRef.current) fillRef.current.style.height = `${normalized * 100}%`;
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (touchId.current !== null) return;
    const touch = e.changedTouches[0];
    touchId.current = touch.identifier;
    update(touch.clientY);
    onActivity();
  }, [update, onActivity]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchId.current) {
        update(e.changedTouches[i].clientY);
        onActivity();
        break;
      }
    }
  }, [update, onActivity]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchId.current) {
        touchId.current = null;
        setTouchThrottle(0);
        if (fillRef.current) fillRef.current.style.height = '0%';
        break;
      }
    }
  }, []);

  return (
    <div
      ref={trackRef}
      className="touch-throttle"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div ref={fillRef} className="touch-throttle-fill" />
      <div className="touch-throttle-label">THR</div>
    </div>
  );
}

/**
 * Full-screen catcher behind the joystick/throttle. A drag that starts on empty
 * space orbits the chase camera; touches that land on the controls target those
 * elements directly (they sit above this layer) so the two never conflict.
 */
function CameraDragLayer({ onActivity }: { onActivity: () => void }) {
  const touchId = useRef<number | null>(null);
  const last = useRef({ x: 0, y: 0 });

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (touchId.current !== null) return;
    const t = e.changedTouches[0];
    touchId.current = t.identifier;
    last.current = { x: t.clientX, y: t.clientY };
    onActivity();
  }, [onActivity]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === touchId.current) {
        addCameraLook(t.clientX - last.current.x, t.clientY - last.current.y);
        last.current = { x: t.clientX, y: t.clientY };
        onActivity();
        break;
      }
    }
  }, [onActivity]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchId.current) {
        touchId.current = null;
        endCameraLook();
        break;
      }
    }
  }, []);

  return (
    <div
      className="camera-drag-layer"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    />
  );
}

export function TouchControls() {
  const sceneMode = useStore((s) => s.sceneMode);
  const [visible, setVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  const onActivity = useCallback(() => {
    setVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
  }, []);

  useEffect(() => {
    hideTimer.current = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      clearTouchJoystick();
      setTouchThrottle(0);
    };
  }, []);

  if (sceneMode.type !== 'piloting') return null;

  const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  if (!isTouch) return null;

  return (
    <div className="touch-controls">
      <CameraDragLayer onActivity={onActivity} />
      <div className="touch-controls-pads" style={{ opacity: visible ? 1 : 0.15 }}>
        <Joystick onActivity={onActivity} />
        <ThrottleSlider onActivity={onActivity} />
      </div>
    </div>
  );
}

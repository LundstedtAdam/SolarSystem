import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import {
  voxelInput,
  voxelScan,
  voxelSilo,
  voxelWheel,
  resetVoxelInput,
  isTouchDevice,
  radialShape,
  resolveWheelSlice,
} from '../voxel/voxelControls';

// Mobile-first on-foot controls: left joystick to move, right-side drag to look,
// jump button. Writes the shared voxelInput the PlayerController reads. Hidden
// on non-touch devices (desktop uses pointer-lock + WASD).

function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const pid = useRef<number | null>(null);

  const set = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const rad = r.width / 2;
    const len = Math.hypot(dx, dy) || 1;
    const cl = Math.min(len, rad);
    const nx = dx / len;
    const ny = dy / len;
    // Normalized radial dead zone + S-curve (1.5), same math as the gamepad.
    const dz = useStore.getState().controls.deadzone;
    const shaped = radialShape(nx * (cl / rad), ny * (cl / rad), dz);
    voxelInput.move.x = shaped.x;
    voxelInput.move.z = -shaped.y;
    if (knob.current) knob.current.style.transform = `translate(${nx * cl}px, ${ny * cl}px)`;
  };
  const end = (e: React.PointerEvent) => {
    if (e.pointerId !== pid.current) return;
    pid.current = null;
    voxelInput.move.x = 0;
    voxelInput.move.z = 0;
    if (knob.current) knob.current.style.transform = 'translate(0,0)';
  };

  return (
    <div
      ref={base}
      className="touch-joystick voxel-pad"
      onPointerDown={(e) => {
        pid.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        set(e);
      }}
      onPointerMove={(e) => {
        if (e.pointerId === pid.current) set(e);
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div ref={knob} className="touch-joystick-knob" />
    </div>
  );
}

function LookLayer() {
  const pid = useRef<number | null>(null);
  const last = useRef({ x: 0, y: 0 });
  return (
    <div
      className="voxel-look-layer"
      onPointerDown={(e) => {
        pid.current = e.pointerId;
        last.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        if (e.pointerId !== pid.current) return;
        voxelInput.look.dx += e.clientX - last.current.x;
        voxelInput.look.dy += e.clientY - last.current.y;
        last.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        if (e.pointerId === pid.current) pid.current = null;
      }}
      onPointerCancel={() => {
        pid.current = null;
      }}
    />
  );
}

// Hold to mine continuously; release to stop.
function DigButton() {
  const stop = () => {
    voxelInput.mine = false;
  };
  return (
    <button
      className="voxel-dig-btn"
      onPointerDown={(e) => {
        e.stopPropagation();
        voxelInput.mine = true;
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
    >
      DIG
    </button>
  );
}

// Single-tap scan of the anomaly in the crosshair. Active (and only tappable)
// while a scannable POI is in range and roughly ahead — polled from voxelScan.
function ScanButton() {
  const { t } = useT();
  const [active, setActive] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setActive(voxelScan.available), 120);
    return () => clearInterval(id);
  }, []);
  return (
    <button
      className={`voxel-scan-btn${active ? ' active' : ''}`}
      aria-disabled={!active}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (active) voxelInput.scan = true;
      }}
    >
      {t('scan').toUpperCase()}
    </button>
  );
}

// Hold to open the item wheel, drag to a wedge, release to select — mirrors
// the desktop KeyQ-hold gesture (see voxelControls.ts's `resolveWheelSlice`).
// Deliberately not modal: nothing here pauses input or exits any lock state.
function WheelButton() {
  const pid = useRef<number | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const close = () => {
    pid.current = null;
    voxelWheel.open = false;
  };
  return (
    <button
      className="voxel-wheel-btn"
      onPointerDown={(e) => {
        e.stopPropagation();
        pid.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, y: e.clientY };
        voxelWheel.open = true;
        voxelWheel.dx = 0;
        voxelWheel.dy = 0;
      }}
      onPointerMove={(e) => {
        if (e.pointerId !== pid.current) return;
        voxelWheel.dx = e.clientX - start.current.x;
        voxelWheel.dy = e.clientY - start.current.y;
      }}
      onPointerUp={(e) => {
        if (e.pointerId !== pid.current) return;
        voxelWheel.selected = resolveWheelSlice(voxelWheel.dx, voxelWheel.dy);
        close();
      }}
      onPointerCancel={close}
    >
      TOOL
    </button>
  );
}

function JumpButton() {
  const up = () => {
    voxelInput.jump = false;
  };
  return (
    <button
      className="voxel-jump-btn"
      onPointerDown={(e) => {
        e.stopPropagation();
        voxelInput.jump = true;
      }}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerLeave={up}
    >
      JUMP
    </button>
  );
}

// Place the active buildable (edge-triggered, one per tap).
function PlaceButton() {
  const { t } = useT();
  return (
    <button
      className="voxel-place-btn"
      onPointerDown={(e) => {
        e.stopPropagation();
        voxelInput.place = true;
      }}
    >
      {t('place').toUpperCase()}
    </button>
  );
}

// Deposit the backpack into a nearby silo — only active when one is in range.
function DepositButton() {
  const { t } = useT();
  const [active, setActive] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setActive(voxelSilo.available), 120);
    return () => clearInterval(id);
  }, []);
  if (!active) return null;
  return (
    <button
      className="voxel-deposit-btn active"
      onPointerDown={(e) => {
        e.stopPropagation();
        voxelInput.deposit = true;
      }}
    >
      {t('deposit').toUpperCase()}
    </button>
  );
}

export function VoxelTouchControls() {
  const mode = useStore((s) => s.sceneMode.type);
  const [touch] = useState(() => isTouchDevice());

  useEffect(() => {
    if (mode !== 'voxel') resetVoxelInput();
  }, [mode]);

  if (mode !== 'voxel' || !touch) return null;

  return (
    <div className="voxel-touch">
      <LookLayer />
      <Joystick />
      <DepositButton />
      <PlaceButton />
      <ScanButton />
      <DigButton />
      <JumpButton />
      <WheelButton />
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { voxelInput, resetVoxelInput, isTouchDevice } from '../voxel/voxelControls';

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
    voxelInput.move.x = nx * (cl / rad);
    voxelInput.move.z = -ny * (cl / rad);
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
      <JumpButton />
    </div>
  );
}

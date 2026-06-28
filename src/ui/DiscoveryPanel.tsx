import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { voxelTelemetry, voxelScan, consumeScan } from '../voxel/voxelControls';
import { getVoxelTerrain } from '../voxel/voxelBiomes';
import { seedFromName } from '../voxel/noise';
import { findNearbyPOI } from '../voxel/worldGen';

// Phase 10.4 — the discovery loop. No quest markers: a short-range sensor only
// hints that *something* is near, and walking up to it lets you scan its layered
// story into the knowledge journal. Knowledge persists across reloads (store).
const SENSOR_RANGE = 48; // a faint "something is here" hint
const SCAN_RANGE = 14; // close enough to actually scan
// Half-angle (deg) of the "in the crosshair" cone — the Scan button only lights
// up when the anomaly is roughly in front of the player, not merely nearby.
const CROSSHAIR_CONE = 45;

interface Nearby {
  id: string;
  name: string;
  dist: number;
  bearing: number; // degrees relative to facing, 0 = ahead
  story?: { base: string; disruption: string; human: string };
  clue?: string;
  mysteryId?: string;
  discovered: boolean;
}

export function DiscoveryPanel() {
  const sceneMode = useStore((s) => s.sceneMode);
  const planet = sceneMode.type === 'voxel' ? sceneMode.planet : '';
  const discovered = useStore((s) => s.discovered);
  const journal = useStore((s) => s.journal);
  const recordDiscovery = useStore((s) => s.recordDiscovery);
  const { t } = useT();

  const [nearby, setNearby] = useState<Nearby | null>(null);
  const [readout, setReadout] = useState<Nearby | null>(null);
  const [journalOpen, setJournalOpen] = useState(false);
  const readoutTimer = useRef<ReturnType<typeof setTimeout>>();
  const nearbyRef = useRef<Nearby | null>(null);
  nearbyRef.current = nearby;
  // Stable handle to the latest scan() so the poll loop (which doesn't depend on
  // scan in its deps) never calls a stale closure.
  const scanRef = useRef<() => void>(() => {});

  // Poll the nearest POI a few times a second (cheap: scans a small cell grid).
  // Also publishes whether a scan is available (in range + roughly in the
  // crosshair) for the on-screen Scan button, and consumes one-shot scan
  // requests coming from that button, the gamepad's left trigger, or the E key.
  useEffect(() => {
    if (sceneMode.type !== 'voxel') {
      setNearby(null);
      voxelScan.available = false;
      return;
    }
    const params = getVoxelTerrain(planet);
    const seed = seedFromName(planet);
    let running = true;
    const tick = () => {
      if (!running) return;
      const { x, z, yaw } = voxelTelemetry;
      const hit = findNearbyPOI(params, seed, x, z, SENSOR_RANGE);
      if (hit) {
        const dx = hit.ax - x;
        const dz = hit.az - z;
        const fx = -Math.sin(yaw);
        const fz = -Math.cos(yaw);
        const len = Math.hypot(dx, dz) || 1;
        const tx = dx / len;
        const tz = dz / len;
        const bearing = (Math.atan2(fx * tz - fz * tx, fx * tx + fz * tz) * 180) / Math.PI;
        const isDiscovered = !!discovered[`${planet}:${hit.spec.id}`];
        setNearby({
          id: hit.spec.id,
          name: hit.spec.name,
          dist: hit.dist,
          bearing,
          story: hit.spec.story,
          clue: hit.spec.clue,
          mysteryId: hit.spec.mysteryId,
          discovered: isDiscovered,
        });
        voxelScan.available =
          !isDiscovered && hit.dist <= SCAN_RANGE && Math.abs(bearing) <= CROSSHAIR_CONE;
      } else {
        setNearby(null);
        voxelScan.available = false;
      }
      if (consumeScan()) scanRef.current();
    };
    const iv = setInterval(tick, 120);
    tick();
    return () => {
      running = false;
      voxelScan.available = false;
      clearInterval(iv);
    };
  }, [sceneMode.type, planet, discovered]);

  const scan = useCallback(() => {
    const n = nearbyRef.current;
    if (!n || n.dist > SCAN_RANGE || n.discovered) return;
    const isNew = recordDiscovery({
      planet,
      id: n.id,
      name: n.name,
      story: n.story,
      clue: n.clue,
      mysteryId: n.mysteryId,
    });
    if (isNew) {
      setReadout(n);
      if (readoutTimer.current) clearTimeout(readoutTimer.current);
      readoutTimer.current = setTimeout(() => setReadout(null), 9000);
    }
  }, [planet, recordDiscovery]);
  scanRef.current = scan;

  // Keyboard: E to scan, J to toggle the journal.
  useEffect(() => {
    if (sceneMode.type !== 'voxel') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyE') scan();
      else if (e.code === 'KeyJ') setJournalOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sceneMode.type, scan]);

  if (sceneMode.type !== 'voxel') return null;

  const arrow = nearby ? bearingArrow(nearby.bearing) : '';

  return (
    <div style={panelRoot}>
      {/* Sensor hint — direction + distance only, never a map waypoint. The
          actual Scan action lives in the bottom thumb-reach cluster. */}
      {nearby && !readout && (
        <div style={sensor}>
          {nearby.discovered ? '◇' : '◆'} {arrow} {t('anomaly')} · {nearby.dist.toFixed(0)}m
        </div>
      )}

      {/* Scan readout — the layered story, shown briefly after a scan. */}
      {readout && (
        <div style={readoutBox}>
          <div style={readoutTitle}>{readout.name}</div>
          {readout.story && (
            <>
              <p style={layerBase}>{readout.story.base}</p>
              <p style={layerMid}>{readout.story.disruption}</p>
              <p style={layerHuman}>{readout.story.human}</p>
            </>
          )}
          {readout.clue && <p style={clueLine}>“{readout.clue}”</p>}
        </div>
      )}

      <button style={journalToggle} onClick={() => setJournalOpen((o) => !o)}>
        {t('journal')} (J) · {journal.length}
      </button>

      {journalOpen && (
        <div style={journalBox}>
          <div style={journalHead}>{t('knowledge')}</div>
          {journal.length === 0 && <p style={emptyNote}>{t('noFindings')}</p>}
          {journal.map((e) => (
            <div key={e.key + e.ts} style={journalEntry}>
              <div style={journalName}>{e.name}</div>
              {e.story && <p style={journalStory}>{e.story.human}</p>}
              {e.clue && <p style={clueLine}>“{e.clue}”</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function bearingArrow(deg: number): string {
  const a = ((deg % 360) + 360) % 360;
  const dirs = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
  return dirs[Math.round(a / 45) % 8];
}

// --- self-contained styles (overlay; pointer-events only on controls) -------
const panelRoot: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  fontFamily: 'system-ui, sans-serif',
  color: '#e8f0f4',
};
const sensor: React.CSSProperties = {
  position: 'absolute',
  top: '14%',
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'rgba(0,0,0,0.4)',
  padding: '6px 12px',
  borderRadius: 8,
  fontSize: 14,
  letterSpacing: 0.5,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};
const readoutBox: React.CSSProperties = {
  position: 'absolute',
  top: '20%',
  left: '50%',
  transform: 'translateX(-50%)',
  width: 'min(440px, 86vw)',
  background: 'rgba(6,10,14,0.82)',
  border: '1px solid rgba(150,190,220,0.3)',
  borderRadius: 10,
  padding: '14px 18px',
};
const readoutTitle: React.CSSProperties = { fontSize: 17, fontWeight: 600, marginBottom: 8 };
const layerBase: React.CSSProperties = { margin: '6px 0', color: '#cfe6f2' };
const layerMid: React.CSSProperties = { margin: '6px 0', color: '#e6c9a8' };
const layerHuman: React.CSSProperties = { margin: '6px 0', color: '#cdbce0', fontStyle: 'italic' };
const clueLine: React.CSSProperties = { margin: '8px 0 0', color: '#9fd0ff' };
const journalToggle: React.CSSProperties = {
  pointerEvents: 'auto',
  position: 'absolute',
  bottom: 16,
  left: 16,
  background: 'rgba(0,0,0,0.4)',
  border: '1px solid rgba(255,255,255,0.2)',
  color: '#e8f0f4',
  padding: '8px 12px',
  borderRadius: 8,
  fontSize: 13,
  cursor: 'pointer',
};
const journalBox: React.CSSProperties = {
  pointerEvents: 'auto',
  position: 'absolute',
  bottom: 58,
  left: 16,
  width: 'min(360px, 80vw)',
  maxHeight: '46vh',
  overflowY: 'auto',
  background: 'rgba(6,10,14,0.9)',
  border: '1px solid rgba(150,190,220,0.3)',
  borderRadius: 10,
  padding: '12px 14px',
};
const journalHead: React.CSSProperties = {
  fontSize: 13,
  textTransform: 'uppercase',
  letterSpacing: 1.5,
  opacity: 0.7,
  marginBottom: 8,
};
const emptyNote: React.CSSProperties = { opacity: 0.6, fontSize: 13 };
const journalEntry: React.CSSProperties = {
  borderTop: '1px solid rgba(255,255,255,0.08)',
  padding: '8px 0',
};
const journalName: React.CSSProperties = { fontWeight: 600, fontSize: 14 };
const journalStory: React.CSSProperties = { margin: '4px 0 0', fontSize: 13, opacity: 0.85 };

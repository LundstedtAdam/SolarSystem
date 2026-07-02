import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { voxelTelemetry, voxelScan, consumeScan } from '../voxel/voxelControls';
import { getVoxelTerrain } from '../voxel/voxelBiomes';
import { seedFromName } from '../voxel/noise';
import { findNearbyPOI, findNearbyScienceNote, findNearbyDeepSite, scanOreDirection } from '../voxel/worldGen';
import { SCANNER_SAMPLE_RADIUS } from '../ship/upgrades';
import { ORE_TO_RESOURCE } from '../voxel/voxelTypes';
import { RESOURCE_LABEL } from '../voxel/resourceProfiles';

// Phase 10.4 — the discovery loop. No quest markers: a short-range sensor only
// hints that *something* is near, and walking up to it lets you scan its layered
// story into the knowledge journal. Knowledge persists across reloads (store).
const SENSOR_RANGE = 48; // a faint "something is here" hint
const SCAN_RANGE = 14; // close enough to actually scan
// Half-angle (deg) of the "in the crosshair" cone — the Scan button only lights
// up when the anomaly is roughly in front of the player, not merely nearby.
const CROSSHAIR_CONE = 45;

interface Candidate {
  id: string;
  name: string;
  dist: number;
  ax: number;
  az: number;
  speculative: boolean;
  story?: { base: string; disruption?: string; human: string };
  clue?: string;
  mysteryId?: string;
}

interface Nearby {
  id: string;
  name: string;
  dist: number;
  bearing: number; // degrees relative to facing, 0 = ahead
  story?: { base: string; disruption?: string; human: string };
  clue?: string;
  mysteryId?: string;
  discovered: boolean;
  /** True for Layer 2 (fictional deep-discovery) content — drives the
   *  "SPECULATIVE" tag/accent so it can never be confused with real content. */
  speculative: boolean;
}

export function DiscoveryPanel() {
  const sceneMode = useStore((s) => s.sceneMode);
  const planet = sceneMode.type === 'voxel' ? sceneMode.planet : '';
  const discovered = useStore((s) => s.discovered);
  const journal = useStore((s) => s.journal);
  const recordDiscovery = useStore((s) => s.recordDiscovery);
  const scannerTier = useStore((s) => s.shipUpgrades.scanner);
  const { t } = useT();

  const [nearby, setNearby] = useState<Nearby | null>(null);
  const [readout, setReadout] = useState<Nearby | null>(null);
  const [journalOpen, setJournalOpen] = useState(false);
  const [oreHeat, setOreHeat] = useState<{ bearing: number; label: string; strength: number } | null>(
    null,
  );
  const oreTickCount = useRef(0);
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
      setOreHeat(null);
      voxelScan.available = false;
      return;
    }
    const params = getVoxelTerrain(planet);
    const seed = seedFromName(planet);
    let running = true;
    const tick = () => {
      if (!running) return;
      const { x, y, z, yaw } = voxelTelemetry;

      // Orbital-scanner ore heat (Phase 11.5): a coarse directional ping, not
      // a map marker — throttled to ~every 6th tick (~720ms) since the sample
      // is noise-heavy, unlike the cheap cell-hash POI lookups below. Off
      // entirely without the scanner upgrade.
      if (scannerTier > 0) {
        oreTickCount.current++;
        if (oreTickCount.current % 6 === 0) {
          const radius = SCANNER_SAMPLE_RADIUS[scannerTier];
          const dirs = 8 + scannerTier * 4;
          const heat = scanOreDirection(params, seed, x, y, z, radius, dirs);
          if (heat) {
            const tx = Math.sin(heat.bearingRad);
            const tz = Math.cos(heat.bearingRad);
            const fx = -Math.sin(yaw);
            const fz = -Math.cos(yaw);
            const bearing = (Math.atan2(fx * tz - fz * tx, fx * tx + fz * tz) * 180) / Math.PI;
            const resource = ORE_TO_RESOURCE[heat.block];
            setOreHeat(
              resource ? { bearing, label: RESOURCE_LABEL[resource], strength: heat.strength } : null,
            );
          } else {
            setOreHeat(null);
          }
        }
      } else {
        setOreHeat(null);
      }

      // Poll all three sources (POIs, Layer 1 science notes, Layer 2 deep
      // sites) and keep only the single nearest — preserves the "one clear
      // sensor hint, no quest markers" design.
      const poiHit = findNearbyPOI(params, seed, x, z, SENSOR_RANGE);
      const noteHit = findNearbyScienceNote(params, seed, x, z, SENSOR_RANGE);
      const deepHit = findNearbyDeepSite(params, seed, x, y, z, SENSOR_RANGE);

      const candidates: Candidate[] = [];
      if (poiHit) {
        candidates.push({
          id: poiHit.spec.id,
          name: poiHit.spec.name,
          dist: poiHit.dist,
          ax: poiHit.ax,
          az: poiHit.az,
          speculative: false,
          story: poiHit.spec.story,
          clue: poiHit.spec.clue,
          mysteryId: poiHit.spec.mysteryId,
        });
      }
      if (noteHit) {
        candidates.push({
          id: noteHit.spec.id,
          name: noteHit.spec.name,
          dist: noteHit.dist,
          ax: noteHit.ax,
          az: noteHit.az,
          speculative: false,
          story: { base: noteHit.spec.text.headline, human: noteHit.spec.text.detail },
        });
      }
      if (deepHit) {
        candidates.push({
          id: deepHit.spec.id,
          name: deepHit.spec.name,
          dist: deepHit.dist,
          ax: deepHit.spec.position[0],
          az: deepHit.spec.position[1],
          speculative: true,
          story: deepHit.spec.story,
        });
      }
      const candidate = candidates.reduce<Candidate | null>(
        (best, c) => (best === null || c.dist < best.dist ? c : best),
        null,
      );

      if (candidate) {
        const dx = candidate.ax - x;
        const dz = candidate.az - z;
        const fx = -Math.sin(yaw);
        const fz = -Math.cos(yaw);
        const len = Math.hypot(dx, dz) || 1;
        const tx = dx / len;
        const tz = dz / len;
        const bearing = (Math.atan2(fx * tz - fz * tx, fx * tx + fz * tz) * 180) / Math.PI;
        const isDiscovered = !!discovered[`${planet}:${candidate.id}`];
        setNearby({
          id: candidate.id,
          name: candidate.name,
          dist: candidate.dist,
          bearing,
          story: candidate.story,
          clue: candidate.clue,
          mysteryId: candidate.mysteryId,
          discovered: isDiscovered,
          speculative: candidate.speculative,
        });
        voxelScan.available =
          !isDiscovered && candidate.dist <= SCAN_RANGE && Math.abs(bearing) <= CROSSHAIR_CONE;
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
  }, [sceneMode.type, planet, discovered, scannerTier]);

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
      speculative: n.speculative,
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
        <div style={nearby.speculative ? sensorSpeculative : sensor}>
          {nearby.discovered ? '◇' : '◆'} {arrow} {t('anomaly')} · {nearby.dist.toFixed(0)}m
        </div>
      )}

      {/* Orbital-scanner ore heat (Phase 11.5) — a directional ping toward
          the strongest nearby vein signal, never an exact marker. */}
      {oreHeat && (
        <div style={oreHeatSensor}>
          ⛏ {bearingArrow(oreHeat.bearing)} {oreHeat.label}
        </div>
      )}

      {/* Scan readout — the layered story, shown briefly after a scan. */}
      {readout && (
        <div style={readout.speculative ? readoutBoxSpeculative : readoutBox}>
          <div style={readoutTitle}>
            {readout.name}
            {readout.speculative && <span style={speculativeTag}>◈ SPECULATIVE — FICTION</span>}
          </div>
          {readout.story && (
            <>
              <p style={layerBase}>{readout.story.base}</p>
              {readout.story.disruption && <p style={layerMid}>{readout.story.disruption}</p>}
              <p style={layerHuman}>{readout.story.human}</p>
            </>
          )}
          {readout.clue && <p style={clueLine}>“{readout.clue}”</p>}
        </div>
      )}

      <button className="voxel-journal-toggle" onClick={() => setJournalOpen((o) => !o)}>
        {t('journal')} (J) · {journal.length}
      </button>

      {journalOpen && (
        <div style={journalBox}>
          <div style={journalHead}>{t('knowledge')}</div>
          {journal.length === 0 && <p style={emptyNote}>{t('noFindings')}</p>}
          {journal.map((e) => (
            <div key={e.key + e.ts} style={e.speculative ? journalEntrySpeculative : journalEntry}>
              <div style={journalName}>
                {e.name}
                {e.speculative && <span style={speculativeTag}>◈ SPECULATIVE</span>}
              </div>
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
// Orbital-scanner ore-heat ping — parked just below the anomaly sensor so the
// two never overlap when both are active; a distinct amber/mineral tint keeps
// it visually separate from the discovery/mystery sensor line.
const oreHeatSensor: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(14% + 40px)',
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'rgba(40,25,0,0.4)',
  border: '1px solid rgba(230,180,90,0.35)',
  padding: '5px 12px',
  borderRadius: 8,
  fontSize: 13,
  letterSpacing: 0.5,
  color: '#f0d090',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
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
const sensorSpeculative: React.CSSProperties = { ...sensor, border: '1px solid rgba(180,120,255,0.55)' };
// Layer 2 (fictional) accent — a violet/anomalous tint distinct from the
// existing blue/amber Layer 1 & POI palette, so it never reads as real data.
const readoutBoxSpeculative: React.CSSProperties = {
  ...readoutBox,
  border: '1px solid rgba(180,120,255,0.55)',
  boxShadow: '0 0 24px rgba(150,80,255,0.15)',
};
const readoutTitle: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 600,
  marginBottom: 8,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};
const speculativeTag: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.5,
  color: '#c9a3ff',
  border: '1px solid rgba(180,120,255,0.55)',
  borderRadius: 4,
  padding: '2px 6px',
};
const layerBase: React.CSSProperties = { margin: '6px 0', color: '#cfe6f2' };
const layerMid: React.CSSProperties = { margin: '6px 0', color: '#e6c9a8' };
const layerHuman: React.CSSProperties = { margin: '6px 0', color: '#cdbce0', fontStyle: 'italic' };
const clueLine: React.CSSProperties = { margin: '8px 0 0', color: '#9fd0ff' };
// Opens below the top-left Journal/Board-ship cluster (top:12 + top:64, each
// ~44px tall) — well clear of the joystick, which owns the bottom-left corner.
const journalBox: React.CSSProperties = {
  pointerEvents: 'auto',
  position: 'fixed',
  top: 116,
  left: 12,
  zIndex: 11,
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
const journalEntrySpeculative: React.CSSProperties = {
  ...journalEntry,
  borderTop: '1px solid rgba(180,120,255,0.35)',
};
const journalName: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 14,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};
const journalStory: React.CSSProperties = { margin: '4px 0 0', fontSize: 13, opacity: 0.85 };

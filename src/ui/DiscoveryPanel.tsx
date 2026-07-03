import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore, translationTier } from '../store';
import { useT } from '../i18n';
import { voxelTelemetry, voxelScan, consumeScan } from '../voxel/voxelControls';
import { getVoxelTerrain } from '../voxel/voxelBiomes';
import { seedFromName } from '../voxel/noise';
import {
  findNearbyPOI,
  findNearbyScienceNote,
  findNearbyDeepSite,
  findNearbyWarLorePOI,
  findNearbyTranslationFragment,
  scanOreDirection,
} from '../voxel/worldGen';
import { WAR_LORE_ACTS } from '../voxel/contentProfiles';
import { SCANNER_SAMPLE_RADIUS } from '../ship/upgrades';
import { ORE_TO_RESOURCE } from '../voxel/voxelTypes';
import { RESOURCE_LABEL } from '../voxel/resourceProfiles';
import { pingProximity } from '../audio/narrativeAudio';

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

// --- Phase 10.5 — Mystery & Narrative System --------------------------------
// A wholly separate discovery thread from Nearby/Candidate above: war-lore
// POIs and Translation Fragments are never mixed into the Layer 1/2 sensor.
// Undiscovered targets get an imprecise compass pulse + proximity audio cue
// (no exact marker) per the surface-scale navigation spec; the moment one is
// scanned it becomes a "confirmed/owned" journal entry instead.
interface WarLoreNearby {
  id: string;
  name: string;
  dist: number;
  bearing: number;
  act: number;
  isFragment: boolean;
  flavorText?: string;
}

/** Display-level equality for the polled sensor states, so the 120 ms tick
 *  only re-renders when something the player can actually see changed (id,
 *  discovered flag, whole-metre distance or whole-degree bearing). */
function sameReading(
  a: { id: string; dist: number; bearing: number } | null,
  b: { id: string; dist: number; bearing: number } | null,
  aFlag?: boolean,
  bFlag?: boolean,
): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.id === b.id &&
    aFlag === bFlag &&
    Math.round(a.dist) === Math.round(b.dist) &&
    Math.round(a.bearing) === Math.round(b.bearing)
  );
}

export function DiscoveryPanel() {
  const sceneMode = useStore((s) => s.sceneMode);
  const planet = sceneMode.type === 'voxel' ? sceneMode.planet : '';
  const discovered = useStore((s) => s.discovered);
  const journal = useStore((s) => s.journal);
  const recordDiscovery = useStore((s) => s.recordDiscovery);
  const scannerTier = useStore((s) => s.shipUpgrades.scanner);
  const { t } = useT();

  // Phase 10.5 narrative state.
  const warLoreDiscovered = useStore((s) => s.warLoreDiscovered);
  const warLoreJournal = useStore((s) => s.warLoreJournal);
  const translationFragmentsFound = useStore((s) => s.translationFragmentsFound);
  const recordWarLoreDiscovery = useStore((s) => s.recordWarLoreDiscovery);
  const collectTranslationFragment = useStore((s) => s.collectTranslationFragment);
  const markWarLoreRead = useStore((s) => s.markWarLoreRead);
  const warLoreToast = useStore((s) => s.warLoreToast);
  const dismissWarLoreToast = useStore((s) => s.dismissWarLoreToast);
  const tier = translationTier(translationFragmentsFound);
  const warLoreUnread = warLoreJournal.filter((e) => e.unread).length;

  const [nearby, setNearby] = useState<Nearby | null>(null);
  const [readout, setReadout] = useState<Nearby | null>(null);
  const [journalOpen, setJournalOpen] = useState(false);
  const [oreHeat, setOreHeat] = useState<{ bearing: number; label: string; strength: number } | null>(
    null,
  );
  const [warLoreNearby, setWarLoreNearby] = useState<WarLoreNearby | null>(null);
  const [warLoreReadout, setWarLoreReadout] = useState<WarLoreNearby | null>(null);
  const oreTickCount = useRef(0);
  const readoutTimer = useRef<ReturnType<typeof setTimeout>>();
  const warLoreReadoutTimer = useRef<ReturnType<typeof setTimeout>>();
  const warLoreToastTimer = useRef<ReturnType<typeof setTimeout>>();
  const nearbyRef = useRef<Nearby | null>(null);
  nearbyRef.current = nearby;
  const warLoreNearbyRef = useRef<WarLoreNearby | null>(null);
  warLoreNearbyRef.current = warLoreNearby;
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
            const nextHeat = resource
              ? { bearing, label: RESOURCE_LABEL[resource], strength: heat.strength }
              : null;
            setOreHeat((prev) =>
              prev !== null &&
              nextHeat !== null &&
              prev.label === nextHeat.label &&
              Math.round(prev.bearing) === Math.round(nextHeat.bearing) &&
              prev.strength === nextHeat.strength
                ? prev
                : nextHeat,
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

      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      let legacyAvailable = false;
      let legacyBearing = 0;
      if (candidate) {
        const dx = candidate.ax - x;
        const dz = candidate.az - z;
        const len = Math.hypot(dx, dz) || 1;
        const tx = dx / len;
        const tz = dz / len;
        legacyBearing = (Math.atan2(fx * tz - fz * tx, fx * tx + fz * tz) * 180) / Math.PI;
        const isDiscovered = !!discovered[`${planet}:${candidate.id}`];
        const next: Nearby = {
          id: candidate.id,
          name: candidate.name,
          dist: candidate.dist,
          bearing: legacyBearing,
          story: candidate.story,
          clue: candidate.clue,
          mysteryId: candidate.mysteryId,
          discovered: isDiscovered,
          speculative: candidate.speculative,
        };
        setNearby((prev) => (sameReading(prev, next, prev?.discovered, isDiscovered) ? prev : next));
        legacyAvailable =
          !isDiscovered && candidate.dist <= SCAN_RANGE && Math.abs(legacyBearing) <= CROSSHAIR_CONE;
      } else {
        setNearby(null);
      }

      // Phase 10.5 — war-lore POIs + Translation Fragments: a wholly separate
      // sensor from the Layer 1/2 candidates above (never mixed together).
      const warLorePoiHit = findNearbyWarLorePOI(params, seed, x, z, SENSOR_RANGE);
      const fragmentHit = findNearbyTranslationFragment(params, seed, x, z, SENSOR_RANGE);
      const warLoreCandidate =
        warLorePoiHit && (!fragmentHit || warLorePoiHit.dist <= fragmentHit.dist)
          ? {
              id: warLorePoiHit.spec.id,
              name: warLorePoiHit.spec.name,
              dist: warLorePoiHit.dist,
              ax: warLorePoiHit.ax,
              az: warLorePoiHit.az,
              act: warLorePoiHit.spec.act as number,
              isFragment: false,
              flavorText: undefined as string | undefined,
            }
          : fragmentHit
            ? {
                id: fragmentHit.spec.id,
                name: fragmentHit.spec.name,
                dist: fragmentHit.dist,
                ax: fragmentHit.ax,
                az: fragmentHit.az,
                act: fragmentHit.spec.act,
                isFragment: true,
                flavorText: fragmentHit.spec.flavorText as string | undefined,
              }
            : null;

      let warLoreAvailable = false;
      let warLoreBearing = 0;
      if (warLoreCandidate) {
        const isDiscovered = warLoreCandidate.isFragment
          ? translationFragmentsFound.includes(warLoreCandidate.id)
          : !!warLoreDiscovered[`${planet}:${warLoreCandidate.id}`];
        const dx = warLoreCandidate.ax - x;
        const dz = warLoreCandidate.az - z;
        const len = Math.hypot(dx, dz) || 1;
        const tx = dx / len;
        const tz = dz / len;
        const trueBearing = (Math.atan2(fx * tz - fz * tx, fx * tx + fz * tz) * 180) / Math.PI;
        // Undiscovered: imprecise compass pulse, not an exact heading — a slow
        // per-target jitter so the needle wanders rather than pointing exactly.
        const jitter = isDiscovered
          ? 0
          : Math.sin(performance.now() / 900 + seedFromName(warLoreCandidate.id)) * 18;
        warLoreBearing = trueBearing + jitter;
        if (!isDiscovered) {
          const nextWar: WarLoreNearby = {
            id: warLoreCandidate.id,
            name: warLoreCandidate.name,
            dist: warLoreCandidate.dist,
            bearing: warLoreBearing,
            act: warLoreCandidate.act,
            isFragment: warLoreCandidate.isFragment,
            flavorText: warLoreCandidate.flavorText,
          };
          setWarLoreNearby((prev) => (sameReading(prev, nextWar) ? prev : nextWar));
          warLoreAvailable = warLoreCandidate.dist <= SCAN_RANGE && Math.abs(trueBearing) <= CROSSHAIR_CONE;
          pingProximity(warLoreCandidate.dist, SENSOR_RANGE);
        } else {
          setWarLoreNearby(null);
        }
      } else {
        setWarLoreNearby(null);
      }

      voxelScan.available = legacyAvailable || warLoreAvailable;
      if (consumeScan()) scanRef.current();
    };
    const iv = setInterval(tick, 120);
    tick();
    return () => {
      running = false;
      voxelScan.available = false;
      clearInterval(iv);
    };
  }, [sceneMode.type, planet, discovered, scannerTier, warLoreDiscovered, translationFragmentsFound]);

  const scan = useCallback(() => {
    // Legacy (Layer 1/2) candidate takes priority when both are in range —
    // matches the existing single-scan-button UX; the war-lore sensor rarely
    // overlaps it in practice since the two threads use different POI pools.
    const n = nearbyRef.current;
    if (n && n.dist <= SCAN_RANGE && !n.discovered) {
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
      return;
    }

    const w = warLoreNearbyRef.current;
    if (!w || w.dist > SCAN_RANGE) return;
    const isNew = w.isFragment
      ? collectTranslationFragment(w.id, w.act)
      : recordWarLoreDiscovery({ planet, id: w.id, name: w.name, act: w.act });
    if (isNew) {
      setWarLoreReadout(w);
      if (warLoreReadoutTimer.current) clearTimeout(warLoreReadoutTimer.current);
      warLoreReadoutTimer.current = setTimeout(() => setWarLoreReadout(null), 9000);
    }
  }, [planet, recordDiscovery, recordWarLoreDiscovery, collectTranslationFragment]);
  scanRef.current = scan;

  // Auto-dismiss the "Translation Matrix Updated" toast a few seconds after
  // the store raises it.
  useEffect(() => {
    if (!warLoreToast) return;
    if (warLoreToastTimer.current) clearTimeout(warLoreToastTimer.current);
    warLoreToastTimer.current = setTimeout(() => dismissWarLoreToast(), 6000);
  }, [warLoreToast, dismissWarLoreToast]);

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
      <style>{'@keyframes warLoreCompassPulse{0%,100%{opacity:0.35;transform:scale(0.9)}50%{opacity:1;transform:scale(1.15)}}'}</style>
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

      {/* Phase 10.5 — undiscovered war-lore target: a pulsing compass needle
          + proximity audio only, deliberately no exact distance/marker. Once
          scanned it moves into the journal below as a confirmed discovery. */}
      {warLoreNearby && !warLoreReadout && (
        <div style={warLoreSensor}>
          <span style={compassPulse}>{bearingArrow(warLoreNearby.bearing)}</span>
          {warLoreNearby.isFragment ? t('translationFragmentNearby') : t('signalNearby')}
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

      {/* War-lore scan readout: fragments show their flavor text once; POIs
          show the current-tier reading (corrupted or true, per translationTier). */}
      {warLoreReadout && (
        <div style={warLoreReadoutBox}>
          <div style={readoutTitle}>
            {warLoreReadout.name}
            <span style={warLoreTag}>
              {warLoreReadout.isFragment ? '◆ TRANSLATION FRAGMENT' : `ACT ${warLoreReadout.act}`}
            </span>
          </div>
          {warLoreReadout.isFragment ? (
            <p style={layerHuman}>{warLoreReadout.flavorText}</p>
          ) : (
            <p style={layerBase}>{warLoreText(warLoreReadout.act, tier)}</p>
          )}
        </div>
      )}

      {/* Toast — no forced interaction, just a brief on-screen note. */}
      {warLoreToast && <div style={toastBanner}>{warLoreToast.message}</div>}

      <button className="voxel-journal-toggle" onClick={() => setJournalOpen((o) => !o)}>
        {t('journal')} (J) · {journal.length}
        {warLoreUnread > 0 && <span style={unreadBadge}>{warLoreUnread}</span>}
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

          {warLoreJournal.length > 0 && (
            <>
              <div style={{ ...journalHead, marginTop: 12 }}>{t('mysteryLog')}</div>
              {warLoreJournal.map((e) => (
                <div
                  key={e.key + e.ts}
                  style={warLoreJournalEntry}
                  onClick={() => e.unread && markWarLoreRead(e.key)}
                >
                  <div style={journalName}>
                    {e.name}
                    {e.unread && <span style={unreadTag}>● NEW</span>}
                    <span style={warLoreTag}>ACT {e.act}</span>
                  </div>
                  <p style={journalStory}>{warLoreText(e.act, tier)}</p>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Renders a war-lore act's scanner text at the given translation tier — a
 *  pure re-render, never baked in at scan time, so a new fragment retroac­
 *  tively "updates" every prior entry for free. */
function warLoreText(act: number, tier: number): string {
  const a = WAR_LORE_ACTS[act];
  if (!a) return '';
  return tier >= 2 ? a.trueMeaning : a.corruptedText;
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

// --- Phase 10.5 — Mystery & Narrative System styles -------------------------
// A distinct amber/verdigris accent (never the blue Layer 1 or violet Layer 2
// tints) so the war-lore thread always reads as its own, separate system.
const warLoreSensor: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(14% + 78px)',
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'rgba(30,26,10,0.45)',
  border: '1px solid rgba(210,170,60,0.4)',
  padding: '6px 12px',
  borderRadius: 8,
  fontSize: 13,
  letterSpacing: 0.4,
  color: '#e8cf8a',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};
// The needle pulses (opacity breathing) rather than pointing exactly — a
// diegetic "getting warmer" cue, never an exact marker.
const compassPulse: React.CSSProperties = {
  fontSize: 18,
  animation: 'warLoreCompassPulse 1.4s ease-in-out infinite',
};
const warLoreReadoutBox: React.CSSProperties = {
  ...readoutBox,
  border: '1px solid rgba(210,170,60,0.45)',
  boxShadow: '0 0 24px rgba(210,170,60,0.12)',
};
const warLoreTag: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.5,
  color: '#e8cf8a',
  border: '1px solid rgba(210,170,60,0.5)',
  borderRadius: 4,
  padding: '2px 6px',
};
const toastBanner: React.CSSProperties = {
  position: 'absolute',
  top: '8%',
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'rgba(30,26,10,0.85)',
  border: '1px solid rgba(210,170,60,0.5)',
  color: '#f0e0a8',
  padding: '8px 16px',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
};
const unreadBadge: React.CSSProperties = {
  marginLeft: 6,
  background: '#d9a83c',
  color: '#1a1608',
  borderRadius: 10,
  fontSize: 11,
  fontWeight: 700,
  padding: '1px 6px',
};
const unreadTag: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: '#d9a83c',
};
const warLoreJournalEntry: React.CSSProperties = {
  ...journalEntry,
  borderTop: '1px solid rgba(210,170,60,0.3)',
  cursor: 'pointer',
};

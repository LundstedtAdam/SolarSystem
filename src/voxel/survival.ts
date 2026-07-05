// Phase 11.4 — survival: oxygen, tethers, death. Pure helpers over the placed
// structures; all state lives in the store and the per-frame simulation runs in
// PlayerController. None of this executes in creative mode (the default) — the
// entire system is gated on the survival toggle.

import { planetPower } from './power';
import type { Structure } from '../store';

/** Full oxygen supply, in seconds of unprotected exposure. 240s puts the 50%
 *  cue at 2 minutes and the 25% cue at exactly the final ~60 seconds, which is
 *  when the persistent alarm + heartbeat take over. */
export const O2_MAX_SECONDS = 240;
/** Refill is much faster than drain — returning to safety should feel like
 *  relief, not a second wait. */
export const O2_REFILL_RATE = 8;
/** Radius (m) around a live safety point (ship / powered habitat / connected
 *  tether) inside which oxygen refills instead of draining. */
export const SAFE_RADIUS = 9;
/** Max hop distance (m) between tethers (or tether -> source) for the chain to
 *  stay connected. */
export const TETHER_LINK = 12;

/** Warning thresholds as fractions of full supply. */
export const O2_WARN_HALF = 0.5;
export const O2_WARN_LOW = 0.25;

export type SafetySourceKind = 'ship' | 'habitat' | 'tether';

export interface SafetyState {
  /** Inside a safe zone — oxygen refills. */
  safe: boolean;
  /** Distance (m) to the nearest live safety point (Infinity if none). */
  nearestDist: number;
  kind: SafetySourceKind | null;
}

function d3(ax: number, ay: number, az: number, b: [number, number, number]): number {
  return Math.hypot(ax - b[0], ay - b[1], az - b[2]);
}

/** Live safety points on a body: the ship (always), habitats (only while the
 *  body generates any power — a power failure shuts their oxygen down), and
 *  tethers chain-connected to one of those sources within TETHER_LINK hops. */
export function liveSafetyPoints(
  structures: Structure[],
  planet: string,
  shipPos: [number, number, number],
): { pos: [number, number, number]; kind: SafetySourceKind }[] {
  const points: { pos: [number, number, number]; kind: SafetySourceKind }[] = [
    { pos: shipPos, kind: 'ship' },
  ];
  const powered = planetPower(structures, planet).generated > 0;
  const tethers: Structure[] = [];
  for (const s of structures) {
    if (s.planet !== planet) continue;
    if (s.type === 'habitat' && powered) points.push({ pos: s.pos, kind: 'habitat' });
    else if (s.type === 'tether') tethers.push(s);
  }

  // Flood-fill the tether chain outward from the sources. Tether counts are
  // small (player-placed), so the O(n²) sweep is fine.
  const live = new Array<boolean>(tethers.length).fill(false);
  let grew = true;
  while (grew) {
    grew = false;
    for (let i = 0; i < tethers.length; i++) {
      if (live[i]) continue;
      const t = tethers[i];
      const reached =
        points.some((p) => d3(t.pos[0], t.pos[1], t.pos[2], p.pos) <= TETHER_LINK) ||
        tethers.some(
          (o, j) => live[j] && d3(t.pos[0], t.pos[1], t.pos[2], o.pos) <= TETHER_LINK,
        );
      if (reached) {
        live[i] = true;
        grew = true;
      }
    }
  }
  for (let i = 0; i < tethers.length; i++) {
    if (live[i]) points.push({ pos: tethers[i].pos, kind: 'tether' });
  }
  return points;
}

/** Whether the player at (px, py, pz) is inside a safe zone, plus the distance
 *  to the nearest live safety point (drives the death note's "Xm from safety"). */
export function computeSafety(
  structures: Structure[],
  planet: string,
  shipPos: [number, number, number],
  px: number,
  py: number,
  pz: number,
): SafetyState {
  let nearestDist = Infinity;
  let kind: SafetySourceKind | null = null;
  for (const p of liveSafetyPoints(structures, planet, shipPos)) {
    const d = d3(px, py, pz, p.pos);
    if (d < nearestDist) {
      nearestDist = d;
      kind = p.kind;
    }
  }
  return { safe: nearestDist <= SAFE_RADIUS, nearestDist, kind };
}

/** Where the player wakes up after blacking out: the nearest powered habitat,
 *  else the ship. Nothing is lost on death — the setback is the walk back. */
export function respawnAnchor(
  structures: Structure[],
  planet: string,
  shipPos: [number, number, number],
  px: number,
  py: number,
  pz: number,
): { pos: [number, number, number]; kind: 'habitat' | 'ship' } {
  const powered = planetPower(structures, planet).generated > 0;
  let best: [number, number, number] | null = null;
  let bestD = Infinity;
  if (powered) {
    for (const s of structures) {
      if (s.planet !== planet || s.type !== 'habitat') continue;
      const d = d3(px, py, pz, s.pos);
      if (d < bestD) {
        bestD = d;
        best = s.pos;
      }
    }
  }
  if (best) return { pos: [best[0] + 0.5, best[1] + 2.5, best[2] + 0.5], kind: 'habitat' };
  return { pos: shipPos, kind: 'ship' };
}

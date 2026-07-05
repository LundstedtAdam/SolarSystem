// Phase 10.5 — ambient proximity audio cue for undiscovered war-lore targets.
// Diegetic "getting warmer" ping: no exact marker, just a soft blip whose rate
// and volume climb as the player nears an undiscovered mystery-thread POI or
// Translation Fragment. Self-contained (lazy AudioContext) so it works without
// wiring into the existing music/SFX bus.

let ctx: AudioContext | null = null;
let lastPingAt = 0;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function playBlip(volume: number): void {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = 660;
  gain.gain.value = 0;
  osc.connect(gain).connect(c.destination);
  const t0 = c.currentTime;
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
  osc.start(t0);
  osc.stop(t0 + 0.24);
}

/** Call every poll tick with the current distance to the nearest undiscovered
 *  mystery-thread target (or null when there is none in sensor range). Plays
 *  a blip at an interval + volume that scales with proximity — never more
 *  often than every 160ms so it can't become a shrill alarm at point-blank. */
export function pingProximity(dist: number | null, maxDist: number): void {
  if (dist === null) return;
  const proximity = Math.max(0, Math.min(1, 1 - dist / maxDist)); // 0 far .. 1 close
  if (proximity <= 0) return;
  const interval = Math.max(160, 1400 - proximity * 1200); // 1400ms far -> 160ms close
  const now = performance.now();
  if (now - lastPingAt < interval) return;
  lastPingAt = now;
  playBlip(0.04 + proximity * 0.18);
}

import { describe, expect, it } from 'vitest';
import { getGroundClutter } from './scatterProfiles';

// World-richness Phase 2/4: ground clutter must respect the game's existing
// no-confirmed-life rule (contentProfiles.ts scienceNotes.lifeStatus) —
// flora-like kinds ('blade' grass, 'fungus' blooms/growths) only ever appear
// on Earth (real biology) or on bodies whose life question is still open
// ('theoretical'/'inconclusive'). Everywhere else stays abiotic: 'rock' grit
// plus the universal 'crystal' ore-tell fleck (Phase 4), both non-living.
const ABIOTIC_KINDS = ['rock', 'crystal'];

describe('getGroundClutter narrative gating', () => {
  it('always includes an abiotic grit layer first, regardless of body', () => {
    for (const planet of ['Jorden', 'Mars', 'Merkurius']) {
      const layers = getGroundClutter(planet);
      expect(layers.length).toBeGreaterThan(0);
      expect(layers[0].kind).toBe('rock');
    }
  });

  it('gives Earth real grass + flora accents (unconditional real biology)', () => {
    const layers = getGroundClutter('Jorden');
    expect(layers.some((l) => l.kind === 'blade')).toBe(true);
    expect(layers.some((l) => l.kind === 'fungus')).toBe(true);
  });

  it('gives a not_detected body abiotic-only clutter (no life-like kinds)', () => {
    // Merkurius: scienceNotes.lifeStatus === 'not_detected'.
    const layers = getGroundClutter('Merkurius');
    expect(layers.every((l) => ABIOTIC_KINDS.includes(l.kind))).toBe(true);
  });

  it('gives a theoretical/inconclusive body sparse ambiguous growths, never grass', () => {
    // Mars: scienceNotes.lifeStatus === 'theoretical'.
    const layers = getGroundClutter('Mars');
    expect(layers.some((l) => l.kind === 'fungus')).toBe(true);
    expect(layers.some((l) => l.kind === 'blade')).toBe(false);
    // Ambiguous growths are deliberately sparse — much lower density than
    // Earth's flora accent layer, never a dense "confirmed ecosystem" look.
    const growth = layers.find((l) => l.kind === 'fungus')!;
    expect(growth.density).toBeLessThan(0.1);
  });

  it('flags Earth flora layers for polar thinning (World Richness Phase 5)', () => {
    const layers = getGroundClutter('Jorden');
    expect(layers.find((l) => l.kind === 'blade')?.latitudeFalloff).toBe(true);
    expect(layers.find((l) => l.kind === 'fungus')?.latitudeFalloff).toBe(true);
  });
});

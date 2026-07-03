import { describe, expect, it } from 'vitest';
import { BODY_NAMES, bodyName } from './i18n';
import { PLANETS } from './systems/bodies';

// Regression coverage for a real bug: three UI components rendered the raw
// canonical body id (the Swedish name used internally, e.g. "Jorden") instead
// of translating it, because bodyName() silently falls back to the id itself
// when it's missing from BODY_NAMES. That fallback is convenient for ids that
// happen to be spelled the same in both languages, but it also means a
// missing table entry never throws — it just quietly ships the wrong text
// for a body whose spelling *does* differ (as it did for Earth). This test
// makes that failure mode loud instead of silent.
describe('BODY_NAMES completeness', () => {
  it('has an entry for every planet and moon in the body data', () => {
    const missing: string[] = [];
    for (const p of PLANETS) {
      if (!BODY_NAMES[p.name]) missing.push(p.name);
      for (const m of p.moons) {
        if (!BODY_NAMES[m.name]) missing.push(m.name);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('bodyName', () => {
  it('translates ids that differ between languages', () => {
    expect(bodyName('Jorden', 'en')).toBe('Earth');
    expect(bodyName('Jorden', 'sv')).toBe('Jorden');
    expect(bodyName('Merkurius', 'en')).toBe('Mercury');
    expect(bodyName('Månen', 'en')).toBe('Moon');
  });

  it('falls back to the id itself for an unknown body', () => {
    expect(bodyName('Nibiru', 'en')).toBe('Nibiru');
  });
});

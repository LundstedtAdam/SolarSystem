// Structural guard for the two-layer biome/life content system. The primary
// guard is the type system itself (ScienceNoteSpec.lifeStatus has no
// 'confirmed' member — a compile error, not a lint warning). This is a
// secondary free-text heuristic: it catches confirmatory-sounding prose that
// slips past the type check (e.g. hedge-free wording paired with a
// technically-compliant lifeStatus). A wording false positive must never
// crash the shipped game for a player, so it only throws in dev.
import type { ScienceNoteSpec } from './contentProfiles';

const CONFIRMATORY = [
  /\bconfirmed\s+life\b/i,
  /\bconfirms?\s+(the\s+)?existence of life\b/i,
  /\bproof of (alien|extraterrestrial) life\b/i,
  /\bdiscovered\s+life\b/i,
  /\blife\s+has\s+been\s+found\b/i,
  /\bhosts?\s+life\b/i,
  /\bsupports?\s+(complex\s+)?life\b/i,
  /\bteeming with life\b/i,
];

const HEDGES = [
  /theoriz(e|ed|es)/i,
  /possibilit(y|ies)/i,
  /(the\s+)?search for/i,
  /no evidence/i,
  /not (been )?detected/i,
  /unconfirmed/i,
  /speculat/i,
  /suspected/i,
  /hypothes/i,
];

/** Throws (dev) / logs (prod) if a Layer 1 science note reads as an
 *  unqualified claim of confirmed extraterrestrial life. */
export function assertNoLifeClaim(note: ScienceNoteSpec): void {
  const text = `${note.text.headline} ${note.text.detail}`;
  const hasConfirmatory = CONFIRMATORY.some((re) => re.test(text));
  const hasHedge = HEDGES.some((re) => re.test(text));
  if (hasConfirmatory && !hasHedge) {
    const msg = `contentValidation: scienceNote "${note.id}" reads as an unqualified confirmed-life claim`;
    if (import.meta.env.DEV) throw new Error(msg);
    else console.error(msg);
  }
}

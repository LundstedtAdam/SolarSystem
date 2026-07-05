// Phase 11.5 — ship upgrades. Three of the four systems are gated by
// resources that only exist on specific body types, giving progression a
// reason to travel; the fourth (Quantum Drive) is deliberately NOT a travel
// gate — see the note below.
//
//   Quantum Drive (tiers 1-3) — imposes no restriction anywhere within the
//     solar system. All 16 landable bodies are reachable from the start,
//     with zero ship upgrades. This tier only matters for the Phase 10.5
//     story's Act 8 FTL resolution (departing the solar system entirely,
//     paired with the narrative `ftlUnlocked` flag) — never for in-system
//     travel. Do not reintroduce a distance/range gate keyed off this stat.
//   Orbital scanner (tiers 1-3) — reveals ore veins as a directional heat
//     cue instead of blind digging. Needs Tungsten (arid).
//   Environmental shielding (tier 1 is the hard gate) — required to land on
//     Venus/Io/Europa/Ganymede/Callisto. Needs Titanite (glacial) — this is
//     the "glacial world yields what's needed to survive the volcanic one"
//     step. (Lithium, the volcanic-world resource, is deliberately NOT a
//     shielding ingredient: Lithium only occurs on Venus/Io, which shielding
//     itself gates — using it would soft-lock the run. Titanite from the
//     unshielded outer-ice worlds — Triton, Pluto/Charon — breaks the loop.)
//   Cargo expansion (tiers 1-3) — +50 backpack capacity per tier. Needs
//     Titanite + refined ingots.

import type { ResourceType } from '../voxel/voxelTypes';
import type { CraftedItem } from '../voxel/recipes';

export type UpgradeKind = 'quantumDrive' | 'scanner' | 'shielding' | 'cargo';
export const UPGRADE_KINDS: UpgradeKind[] = ['quantumDrive', 'scanner', 'shielding', 'cargo'];

export interface UpgradeCost {
  resources: Partial<Record<ResourceType, number>>;
  items?: Partial<Record<CraftedItem, number>>;
}

/** Cost to go FROM the given tier TO tier+1 (index 0 = tier 0 -> 1, etc). */
export const UPGRADE_COSTS: Record<UpgradeKind, UpgradeCost[]> = {
  quantumDrive: [
    { resources: { carbon: 10, silicon: 10, copper: 8, zinc: 6 } }, // T1: home (Earth)
    { resources: { iron: 10, wolframite: 8, sphalerite: 6 } }, // T2: nearby moons
    { resources: { iron: 14, malachite: 10, tungsten: 8 }, items: { alloy: 2 } }, // T3: inner (Mars)
  ],
  scanner: [
    { resources: { silicon: 12, tungsten: 6 }, items: { circuit: 1 } },
    { resources: { silicon: 18, tungsten: 12 }, items: { circuit: 2 } },
    { resources: { silicon: 26, tungsten: 18, titanite: 10 }, items: { circuit: 3 } },
  ],
  shielding: [
    { resources: { iron: 16, titanite: 14 }, items: { alloy: 2, circuit: 1 } },
    { resources: { iron: 22, titanite: 22 }, items: { alloy: 3 } },
    { resources: { iron: 30, titanite: 32, hematite: 10 }, items: { alloy: 4, circuit: 2 } },
  ],
  cargo: [
    { resources: { iron: 10, titanite: 8 }, items: { crate: 1 } },
    { resources: { iron: 16, titanite: 16 }, items: { crate: 2 } },
    { resources: { iron: 24, titanite: 24, hematite: 8 }, items: { crate: 3 } },
  ],
};

export const UPGRADE_MAX_TIER = 3;
/** Backpack capacity gained per cargo-expansion tier. */
export const CARGO_CAPACITY_PER_TIER = 50;
/** Extra units revealed by the orbital scanner's heat sample per tier. */
export const SCANNER_SAMPLE_RADIUS = [0, 10, 16, 24];

/** Bodies whose environment is lethal without shielding — a hard descent gate,
 *  not a convenience. Venus (crushing acid atmosphere) + the Jovian system
 *  (Io's volcanism/radiation, and Jupiter's radiation belt for its moons).
 *  This is the ONLY descent gate in the game — every other landable body is
 *  reachable from the start, with zero ship upgrades. */
const SHIELD_REQUIRED = new Set(['Venus', 'Io', 'Europa', 'Ganymede', 'Callisto']);

export function requiresShielding(name: string): boolean {
  return SHIELD_REQUIRED.has(name);
}

export interface ShipUpgrades {
  quantumDrive: number;
  scanner: number;
  shielding: number;
  cargo: number;
}

export const DEFAULT_UPGRADES: ShipUpgrades = { quantumDrive: 0, scanner: 0, shielding: 0, cargo: 0 };

export interface DescentGate {
  ok: boolean;
  /** i18n-free reason code the HUD renders; null when ok. */
  reason: 'shielding' | null;
}

/** Whether the ship's current upgrades allow descending to `name`. Quantum
 *  Drive tier is deliberately not consulted here — see the file header. */
export function canDescend(name: string, upgrades: ShipUpgrades): DescentGate {
  if (requiresShielding(name) && upgrades.shielding < 1) return { ok: false, reason: 'shielding' };
  return { ok: true, reason: null };
}

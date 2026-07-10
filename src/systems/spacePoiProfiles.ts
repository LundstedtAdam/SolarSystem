// Space-specific points of interest: wreckage, signal anomalies, resource
// clusters, and long-distance landmarks — the narrative/exploration-density
// layer for the open-space view. Deliberately small and Act-1-scoped (dozens
// of entries, not thousands), so a flat deterministic array is enough; no
// spatial grid needed at this population size (contrast the belt's
// thousands-of-instances grid in asteroidGrid.ts).
//
// Mirrors the existing two-layer (real/speculative) discovery architecture in
// store.ts rather than inventing a new one: wreckage/anomalies record into
// the same `recordDiscovery`/`recordWarLoreDiscovery` journal the voxel-
// surface POI system already uses, just with `planet: 'space'`. Explicitly
// out of scope: faction reputation, trade economy, NPC ships, dynamic wreck
// generation beyond this fixed set — those are later-act systems.

import type { DiscoveryStory } from '../store';
import { WORLD_SCALE } from './bodies';

export type SpacePoiKind = 'wreckage' | 'anomaly' | 'resourceCluster' | 'landmark';

interface SpacePoiBase {
  id: string;
  name: string;
  kind: SpacePoiKind;
  /** Distance (world units) within which the POI is considered "found". */
  scanRadius: number;
  /** True for Layer 2 (speculative) content — read directly, never inferred. */
  speculative?: boolean;
  story?: DiscoveryStory;
  /** Contributes to the existing cross-body mystery-clue mechanic
   *  (`mysteryClues`/`MYSTERY_THRESHOLD`) instead of a new resolution system. */
  clue?: string;
  mysteryId?: string;
}

export interface FixedSpacePoi extends SpacePoiBase {
  /** Fixed world position — landmarks and anomalies not tied to a specific
   *  belt asteroid. */
  pos: [number, number, number];
}

export interface AnchoredSpacePoi extends SpacePoiBase {
  /** Anchors to a specific belt asteroid's *live* position (resolved via
   *  `asteroidRuntime` at query time, never cached) — the anchor asteroid is
   *  flagged indestructible (see §9 in the design notes / SpacePoiField.tsx)
   *  so a story-critical wreck can't be blown apart by fracture testing. */
  anchorGlobalIdx: number;
}

export type SpacePoiSpec = FixedSpacePoi | AnchoredSpacePoi;

export function isAnchoredPoi(spec: SpacePoiSpec): spec is AnchoredSpacePoi {
  return 'anchorGlobalIdx' in spec;
}

const WS = WORLD_SCALE;

/**
 * A small, fixed, hand-placed set of Act 1 space POIs. Index 137 is deep
 * inside the belt's tier-0 (most numerous) group, which exists at every
 * non-zero quality tier — see asteroidLayout.ts's determinism guarantee —
 * so the anchor always resolves to the same physical rock.
 */
export const SPACE_POIS: SpacePoiSpec[] = [
  {
    id: 'derelict-hull-belt',
    kind: 'wreckage',
    name: 'Derelict hull fragment',
    scanRadius: 40,
    anchorGlobalIdx: 137,
    story: {
      base: 'A hull section, decades old, wedged into the rock rather than resting on it — it arrived with force.',
      disruption: 'No registry markings survive. Whatever struck it here erased them first.',
      human: 'Someone built this to leave. It never got the chance.',
    },
  },
  {
    id: 'signal-belt',
    kind: 'anomaly',
    name: 'Buried transmission (belt)',
    scanRadius: 30,
    pos: [700 * WS, 6 * WS, 720 * WS],
    mysteryId: 'signal',
    clue: 'signal:belt',
    story: {
      base: 'A faint, structured transmission, looping on a dead channel.',
      human: 'It repeats every few seconds, like it is still waiting for a reply.',
    },
  },
  {
    id: 'resource-cluster-alpha',
    kind: 'resourceCluster',
    name: 'Dense ore pocket',
    scanRadius: 50,
    pos: [660 * WS, 2 * WS, 680 * WS],
    story: {
      base: 'A tight cluster of metal-rich rock, denser than the surrounding field.',
      human: 'Good mining, if you can hold position — the traffic through here is worse than most of the belt.',
    },
  },
  {
    id: 'landmark-shattered-core',
    kind: 'landmark',
    name: 'Shattered proto-planet core',
    scanRadius: 80,
    pos: [745 * WS, 10 * WS, 300 * WS],
    story: {
      base: 'A single iron-nickel fragment, far larger than anything else in the field — the exposed core of a world that never finished forming.',
      human: 'You can see it from the inner belt. Everyone uses it to get their bearings out here.',
    },
  },
];

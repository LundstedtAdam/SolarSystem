// Phase 11.1 — placeable buildables. Each buildable knows its resource cost and
// the voxels it stamps relative to the target air cell (the cell in front of the
// aimed face). Placement reuses the symmetric editVoxel pipeline; silos also
// register a Structure entity (store) anchored at their SILO core voxel.

import { BLOCK, type ResourceType } from './voxelTypes';
import type { CraftedItem } from './recipes';

export type BuildableId =
  | 'block'
  | 'silo'
  | 'station'
  | 'habitat'
  | 'solar'
  | 'wind'
  | 'thermal'
  | 'refinery'
  | 'tether';

export interface StampVoxel {
  dx: number;
  dy: number;
  dz: number;
  block: number;
}

export interface Buildable {
  id: BuildableId;
  /** Resource cost, deducted on placement. */
  cost: Partial<Record<ResourceType, number>>;
  /** Crafted-item cost (Phase 11.3 modules consume 11.2 outputs). */
  itemCost?: Partial<Record<CraftedItem, number>>;
  /** Voxels written relative to the target cell. */
  stamp: StampVoxel[];
  /** Structure entity kind to register on placement (undefined = plain voxels). */
  structureType?:
    | 'silo'
    | 'station'
    | 'habitat'
    | 'solar'
    | 'wind'
    | 'thermal'
    | 'refinery'
    | 'tether';
  /** For silos: storage capacity (total units). */
  capacity?: number;
}

export const BUILDABLES: Record<BuildableId, Buildable> = {
  block: {
    id: 'block',
    cost: { silicon: 1 },
    stamp: [{ dx: 0, dy: 0, dz: 0, block: BLOCK.BUILD }],
  },
  silo: {
    id: 'silo',
    cost: { silicon: 12 },
    structureType: 'silo',
    // A short post: SILO core at the base (entity anchor), metal mid, glass cap.
    // The visible resource stack (SiloVisuals) grows above the cap.
    stamp: [
      { dx: 0, dy: 0, dz: 0, block: BLOCK.SILO },
      { dx: 0, dy: 1, dz: 0, block: BLOCK.METAL },
      { dx: 0, dy: 2, dz: 0, block: BLOCK.GLASS },
    ],
    capacity: 240,
  },
  station: {
    id: 'station',
    cost: { iron: 10, silicon: 8 },
    structureType: 'station',
    // A fabricator post: STATION core at the base (anchor), panel mid. A
    // holographic blueprint (StationVisuals) floats above it.
    stamp: [
      { dx: 0, dy: 0, dz: 0, block: BLOCK.STATION },
      { dx: 0, dy: 1, dz: 0, block: BLOCK.PANEL },
    ],
  },
  habitat: {
    id: 'habitat',
    cost: { silicon: 20, iron: 10 },
    structureType: 'habitat',
    // A small pressurized dome: core + panel cross + glass cap. Becomes the
    // oxygen hub / respawn anchor in 11.4.
    stamp: [
      { dx: 0, dy: 0, dz: 0, block: BLOCK.HABITAT },
      { dx: 1, dy: 0, dz: 0, block: BLOCK.PANEL },
      { dx: -1, dy: 0, dz: 0, block: BLOCK.PANEL },
      { dx: 0, dy: 0, dz: 1, block: BLOCK.PANEL },
      { dx: 0, dy: 0, dz: -1, block: BLOCK.PANEL },
      { dx: 0, dy: 1, dz: 0, block: BLOCK.GLASS },
      { dx: 1, dy: 1, dz: 0, block: BLOCK.GLASS },
      { dx: -1, dy: 1, dz: 0, block: BLOCK.GLASS },
      { dx: 0, dy: 1, dz: 1, block: BLOCK.GLASS },
      { dx: 0, dy: 1, dz: -1, block: BLOCK.GLASS },
    ],
  },
  solar: {
    id: 'solar',
    cost: { silicon: 6 },
    itemCost: { circuit: 1 },
    structureType: 'solar',
    // A post with a raised panel array.
    stamp: [
      { dx: 0, dy: 0, dz: 0, block: BLOCK.SOLAR },
      { dx: 0, dy: 1, dz: 0, block: BLOCK.METAL },
      { dx: -1, dy: 2, dz: 0, block: BLOCK.SOLAR },
      { dx: 0, dy: 2, dz: 0, block: BLOCK.SOLAR },
      { dx: 1, dy: 2, dz: 0, block: BLOCK.SOLAR },
    ],
  },
  wind: {
    id: 'wind',
    cost: { iron: 6 },
    itemCost: { alloy: 1 },
    structureType: 'wind',
    // A tall mast (the turbine).
    stamp: [
      { dx: 0, dy: 0, dz: 0, block: BLOCK.WIND },
      { dx: 0, dy: 1, dz: 0, block: BLOCK.METAL },
      { dx: 0, dy: 2, dz: 0, block: BLOCK.METAL },
      { dx: 0, dy: 3, dz: 0, block: BLOCK.WIND },
    ],
  },
  thermal: {
    id: 'thermal',
    cost: { iron: 8 },
    itemCost: { alloy: 1, circuit: 1 },
    structureType: 'thermal',
    // A squat borehole rig.
    stamp: [
      { dx: 0, dy: 0, dz: 0, block: BLOCK.THERMAL },
      { dx: 0, dy: 1, dz: 0, block: BLOCK.METAL },
    ],
  },
  refinery: {
    id: 'refinery',
    cost: { iron: 10 },
    itemCost: { alloy: 2, circuit: 1 },
    structureType: 'refinery',
    // A furnace stack: smelts ore -> ingots while the base has surplus power.
    stamp: [
      { dx: 0, dy: 0, dz: 0, block: BLOCK.REFINERY },
      { dx: 0, dy: 1, dz: 0, block: BLOCK.METAL },
      { dx: 0, dy: 2, dz: 0, block: BLOCK.PANEL },
    ],
  },
  tether: {
    id: 'tether',
    // Deliberately cheap — a tether line into a cave should never be a
    // resource decision, only a planning one (Phase 11.4 survival).
    cost: { carbon: 2 },
    structureType: 'tether',
    stamp: [{ dx: 0, dy: 0, dz: 0, block: BLOCK.TETHER }],
  },
};

export const BUILDABLE_IDS: BuildableId[] = [
  'block',
  'silo',
  'station',
  'habitat',
  'solar',
  'wind',
  'thermal',
  'refinery',
  'tether',
];

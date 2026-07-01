// Phase 11.1 — placeable buildables. Each buildable knows its resource cost and
// the voxels it stamps relative to the target air cell (the cell in front of the
// aimed face). Placement reuses the symmetric editVoxel pipeline; silos also
// register a Structure entity (store) anchored at their SILO core voxel.

import { BLOCK, type ResourceType } from './voxelTypes';

export type BuildableId = 'block' | 'silo' | 'station';

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
  /** Voxels written relative to the target cell. */
  stamp: StampVoxel[];
  /** Structure entity kind to register on placement (undefined = plain voxels). */
  structureType?: 'silo' | 'station';
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
};

export const BUILDABLE_IDS: BuildableId[] = ['block', 'silo', 'station'];

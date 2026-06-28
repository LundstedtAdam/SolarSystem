// Phase 11.1 — placeable buildables. Each buildable knows its resource cost and
// the voxels it stamps relative to the target air cell (the cell in front of the
// aimed face). Placement reuses the symmetric editVoxel pipeline; silos also
// register a Structure entity (store) anchored at their SILO core voxel.

import { BLOCK, type ResourceType } from './voxelTypes';

export type BuildableId = 'block' | 'silo';

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
    // A short post: SILO core at the base (entity anchor), metal mid, glass cap.
    // The visible resource stack (SiloVisuals) grows above the cap.
    stamp: [
      { dx: 0, dy: 0, dz: 0, block: BLOCK.SILO },
      { dx: 0, dy: 1, dz: 0, block: BLOCK.METAL },
      { dx: 0, dy: 2, dz: 0, block: BLOCK.GLASS },
    ],
    capacity: 240,
  },
};

export const BUILDABLE_IDS: BuildableId[] = ['block', 'silo'];

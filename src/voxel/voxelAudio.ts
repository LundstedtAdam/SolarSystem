// Maps a voxel block id to the footstep material the AudioManager synthesises.

import { BLOCK } from './voxelTypes';

export type Footstep = 'dust' | 'sand' | 'rock' | 'ice' | 'grass' | 'water';

export function footstepFor(blockId: number): Footstep {
  switch (blockId) {
    case BLOCK.GRASS:
      return 'grass';
    case BLOCK.SAND:
      return 'sand';
    case BLOCK.WATER:
      return 'water';
    case BLOCK.ICE:
    case BLOCK.ICE_GLOW:
      return 'ice';
    case BLOCK.SURFACE:
    case BLOCK.SUBSOIL:
      return 'dust';
    case BLOCK.SULPHUR:
      return 'sand';
    default:
      return 'rock';
  }
}

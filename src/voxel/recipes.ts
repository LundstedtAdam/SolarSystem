// Phase 11.2 — crafting recipes. Kept deliberately small (A Dark Room model): a
// recipe stays hidden until its `requires` material has been discovered, so the
// list reveals itself as the player mines new worlds rather than dumping a
// spreadsheet up front. Outputs are crafted items (components/tools) consumed by
// later phases (base modules 11.3, ship upgrades 11.5).

import type { ResourceType } from './voxelTypes';

export type CraftedItem =
  | 'alloy'
  | 'circuit'
  | 'drill'
  | 'crate'
  // Phase 11.3 — refinery outputs (smelted while the base has surplus power).
  | 'iron_ingot'
  | 'copper_ingot';

export interface Recipe {
  id: string;
  name: string;
  /** Hidden until this resource has been discovered (undefined = always shown). */
  requires?: ResourceType;
  inputs: Partial<Record<ResourceType, number>>;
  output: CraftedItem;
  qty: number;
}

export const CRAFTED_LABEL: Record<CraftedItem, string> = {
  alloy: 'Refined Alloy',
  circuit: 'Circuit',
  drill: 'Mining Drill',
  crate: 'Cargo Crate',
  iron_ingot: 'Iron Ingot',
  copper_ingot: 'Copper Ingot',
};

/** Display colour per crafted item — mirrors RESOURCE_COLOR (resourceProfiles.ts)
 *  so the backpack grid can render a consistent icon swatch for every stack,
 *  raw or crafted, without needing new art assets. */
export const CRAFTED_COLOR: Record<CraftedItem, [number, number, number]> = {
  alloy: [0.72, 0.74, 0.78],
  circuit: [0.25, 0.65, 0.45],
  drill: [0.8, 0.55, 0.15],
  crate: [0.6, 0.44, 0.28],
  iron_ingot: [0.65, 0.45, 0.35],
  copper_ingot: [0.85, 0.55, 0.25],
};

export const RECIPES: Recipe[] = [
  { id: 'alloy', name: 'Refined Alloy', requires: 'iron', inputs: { iron: 4, silicon: 2 }, output: 'alloy', qty: 1 },
  { id: 'crate', name: 'Cargo Crate', requires: 'silicon', inputs: { silicon: 8, iron: 2 }, output: 'crate', qty: 1 },
  { id: 'circuit', name: 'Circuit', requires: 'copper', inputs: { copper: 2, silicon: 3 }, output: 'circuit', qty: 1 },
  { id: 'drill', name: 'Mining Drill', requires: 'copper', inputs: { copper: 3, iron: 2, silicon: 4 }, output: 'drill', qty: 1 },
];

export function recipeById(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}

/** Recipes visible given the set of discovered resources. */
export function revealedRecipes(seen: Partial<Record<ResourceType, true>>): Recipe[] {
  return RECIPES.filter((r) => !r.requires || seen[r.requires]);
}

// Phase 11 persistence. Only chunks the player actually modified are stored —
// unmodified procedural terrain regenerates from the seed. Each modified chunk
// is its sparse edit overlay (localIndex -> packed voxel) written as two compact
// parallel arrays, keyed by chunk key, under a per-body record in IndexedDB
// (localForage). The backpack inventory is a separate small record.
//
// Compression (RLE / Brotli / Snappy) is deferred to the 11.7 hardening pass;
// the sparse overlay is already minimal for typical edit volumes.

import localforage from 'localforage';
import type { ResourceType } from './voxelTypes';
import type { CraftedItem } from './recipes';
import type { Structure } from '../store';

const SCHEMA = 'v1';

const store = localforage.createInstance({
  name: 'solarsystem',
  storeName: 'phase11',
  description: 'Voxel edits + backpack inventory',
});

/** Per-chunk sparse overlay: parallel [localIndex[], packedVoxel[]] arrays. */
export type ChunkEdits = [number[], number[]];
/** All modified chunks for one body, keyed by chunk key. */
export type BodyEdits = Record<string, ChunkEdits>;

function bodyKey(planet: string): string {
  return `voxel.${SCHEMA}.${planet}`;
}
const INVENTORY_KEY = `inventory.${SCHEMA}`;

/** Load all saved chunk edits for a body (empty object if none / on error). */
export async function loadBodyEdits(planet: string): Promise<BodyEdits> {
  try {
    const v = await store.getItem<BodyEdits>(bodyKey(planet));
    return v ?? {};
  } catch {
    return {};
  }
}

/** Persist a body's modified-chunk overlays. An empty map removes the record. */
export async function saveBodyEdits(planet: string, edits: BodyEdits): Promise<void> {
  try {
    if (Object.keys(edits).length === 0) await store.removeItem(bodyKey(planet));
    else await store.setItem(bodyKey(planet), edits);
  } catch {
    /* quota / unavailable — edits just won't persist this session */
  }
}

export async function loadInventory(): Promise<Partial<Record<ResourceType, number>> | null> {
  try {
    return (await store.getItem<Partial<Record<ResourceType, number>>>(INVENTORY_KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function saveInventory(inv: Partial<Record<ResourceType, number>>): Promise<void> {
  try {
    await store.setItem(INVENTORY_KEY, inv);
  } catch {
    /* ignore */
  }
}

const ITEMS_KEY = `items.${SCHEMA}`;
const SEEN_KEY = `seen.${SCHEMA}`;

export async function loadItems(): Promise<Partial<Record<CraftedItem, number>> | null> {
  try {
    return (await store.getItem<Partial<Record<CraftedItem, number>>>(ITEMS_KEY)) ?? null;
  } catch {
    return null;
  }
}
export async function saveItems(items: Partial<Record<CraftedItem, number>>): Promise<void> {
  try {
    await store.setItem(ITEMS_KEY, items);
  } catch {
    /* ignore */
  }
}
export async function loadSeen(): Promise<Partial<Record<ResourceType, true>> | null> {
  try {
    return (await store.getItem<Partial<Record<ResourceType, true>>>(SEEN_KEY)) ?? null;
  } catch {
    return null;
  }
}
export async function saveSeen(seen: Partial<Record<ResourceType, true>>): Promise<void> {
  try {
    await store.setItem(SEEN_KEY, seen);
  } catch {
    /* ignore */
  }
}

function structuresKey(planet: string): string {
  return `structures.${SCHEMA}.${planet}`;
}

/** Load placed structures (silos) for a body (empty list if none / on error). */
export async function loadStructures(planet: string): Promise<Structure[]> {
  try {
    return (await store.getItem<Structure[]>(structuresKey(planet))) ?? [];
  } catch {
    return [];
  }
}

/** Persist the structures belonging to a body (filters by planet). */
export async function saveStructures(planet: string, all: Structure[]): Promise<void> {
  try {
    const own = all.filter((s) => s.planet === planet);
    if (own.length === 0) await store.removeItem(structuresKey(planet));
    else await store.setItem(structuresKey(planet), own);
  } catch {
    /* ignore */
  }
}

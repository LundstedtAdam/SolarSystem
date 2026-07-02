import { create } from 'zustand';
import type { Object3D } from 'three';
import { daysSinceJ2000, periodDays } from './systems/ephemeris';
import { PLANETS, isLandable, WORLD_SCALE, type PlanetData } from './systems/bodies';
import type { ResourceType } from './voxel/voxelTypes';
import type { BuildableId } from './voxel/buildables';
import { recipeById, type CraftedItem } from './voxel/recipes';
import { planetPower } from './voxel/power';

/** Raw ore -> smelted ingot conversions the refinery performs. */
const SMELT: Array<{ ore: ResourceType; ingot: CraftedItem }> = [
  { ore: 'iron', ingot: 'iron_ingot' },
  { ore: 'copper', ingot: 'copper_ingot' },
];
/** Raw units consumed per ingot. */
const SMELT_RATIO = 2;

/** Radius (voxels) within which a crafting station pulls from nearby silos. */
const PULL_RADIUS_SQ = 12 * 12;

function dist2(a: [number, number, number], b: [number, number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}
import { detectQuality, type Quality } from './systems/quality';
import type { Lang } from './i18n';

export type SceneMode =
  | { type: 'solar' }
  | { type: 'piloting' }
  | { type: 'descending'; target: string; phase: 'orbit' | 'atmosphere' | 'landing' }
  | { type: 'surface'; planet: string }
  // Phase 9: on-foot voxel exploration, entered by disembarking on the surface.
  | { type: 'voxel'; planet: string }
  | { type: 'ascending'; planet: string };

/** Player-tunable flight control feel. */
export interface ControlConfig {
  /** Global rotation-rate multiplier (scales max turn speed). */
  sensitivity: number;
  /** Radial dead zone for the gamepad stick (0.05–0.20). */
  deadzone: number;
  /** Flip the pitch axis. */
  invertPitch: boolean;
  /** When on, the ship stabilizes and decelerates as inputs are released. */
  flightAssist: boolean;
  /** Mouse/touch look sensitivity (0.3–3.0); feeds the cubic first-person look curve. */
  mouseSensitivity: number;
  /** Fine control: caps thrust at 25% and softens rotation (held via Shift). */
  fineControl: boolean;
}

/** Layered narrative-stratigraphy text for a discovered point of interest. */
export interface DiscoveryStory {
  base: string;
  disruption: string;
  human: string;
}

/** A recorded discovery in the player's knowledge journal. */
export interface JournalEntry {
  key: string;
  planet: string;
  name: string;
  story?: DiscoveryStory;
  clue?: string;
  ts: number;
}

/** A resource dropped on the terrain when the backpack overflows. Re-collected
 *  by walking over it once there's space (Phase 11). */
export interface ResourceDrop {
  id: number;
  planet: string;
  pos: [number, number, number];
  type: ResourceType;
  amount: number;
  /** ms timestamp before which the drop can't be re-collected (Minecraft-style
   *  pickup delay) — set when the player intentionally drops a stack so it
   *  doesn't instantly vacuum back in. */
  noPickupUntil?: number;
}

/** Total carried units across all resource stacks. */
export function backpackUsed(inv: Partial<Record<ResourceType, number>>): number {
  let n = 0;
  for (const k in inv) n += inv[k as ResourceType] ?? 0;
  return n;
}

/** A placed storage structure (Phase 11.1). Its voxels persist via the chunk
 *  edit overlay; this entity tracks the stored contents + anchor. */
export type StructureType =
  | 'silo'
  | 'station'
  | 'habitat'
  | 'solar'
  | 'wind'
  | 'thermal'
  | 'refinery';

export interface Structure {
  id: number;
  planet: string;
  type: StructureType;
  /** World voxel of the core (anchor). */
  pos: [number, number, number];
  stored: Partial<Record<ResourceType, number>>;
  capacity: number;
}

/** Total units stored across a structure's stacks. */
export function structureUsed(s: Structure): number {
  let n = 0;
  for (const k in s.stored) n += s.stored[k as ResourceType] ?? 0;
  return n;
}

/** Persisted knowledge progression (Phase 10.4). Knowledge is the reward, so it
 *  survives reloads — but world voxel edits are intentionally not persisted. */
interface DiscoveryState {
  discovered: Record<string, true>;
  journal: JournalEntry[];
  mysteryClues: string[];
}

const DISCOVERY_KEY = 'solarsystem.discovery.v1';
/** Clues (of one mystery) needed before it resolves into an epiphany entry. */
const MYSTERY_THRESHOLD = 3;

/** Resolutions per mystery id. A mystery with no entry here never resolves —
 *  it lingers as an open thread (e.g. the lone Titan 'manufacturer' clue). */
const MYSTERY_RESOLUTIONS: Record<string, { name: string; story: DiscoveryStory }> = {
  signal: {
    name: 'The Signal',
    story: {
      base: 'The same buried transmission, found on three separate worlds.',
      disruption: 'Each site failed the moment it began to receive.',
      human: 'The bearings converge — they all point at the same empty place.',
    },
  },
};

function loadDiscovery(): DiscoveryState {
  const empty: DiscoveryState = { discovered: {}, journal: [], mysteryClues: [] };
  if (typeof window === 'undefined') return empty;
  try {
    const raw = window.localStorage.getItem(DISCOVERY_KEY);
    if (!raw) return empty;
    const p = JSON.parse(raw) as Partial<DiscoveryState>;
    return {
      discovered: p.discovered ?? {},
      journal: p.journal ?? [],
      mysteryClues: p.mysteryClues ?? [],
    };
  } catch {
    return empty;
  }
}

function saveDiscovery(d: DiscoveryState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DISCOVERY_KEY, JSON.stringify(d));
  } catch {
    /* storage full / unavailable — discovery just won't persist this session */
  }
}

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** Real physical data shown in the info panel for the selected body. */
export interface SelectedBody {
  name: string;
  /** Mean radius in km (diameter is derived for display). */
  radiusKm: number;
  /** Semi-major axis in AU (planets) or undefined for moons. */
  semiMajorAxisAU?: number;
  /** Orbital period in days (signed; negative = retrograde). */
  orbitalPeriodDays: number;
  /** Sidereal rotation period in days (planets only). */
  rotationPeriodDays?: number;
  axialTiltDeg?: number;
  eccentricity?: number;
  /** Surface texture URL, shown as a thumbnail. */
  thumbnail?: string;
}

/** Build the info-panel payload for a planet (shared by clicks and cycling). */
export function planetSelected(p: PlanetData): SelectedBody {
  return {
    name: p.name,
    radiusKm: p.realRadiusKm,
    semiMajorAxisAU: p.elements.aAU,
    orbitalPeriodDays: periodDays(p.elements),
    rotationPeriodDays: p.rotationPeriodDays,
    axialTiltDeg: p.axialTiltDeg,
    eccentricity: p.elements.e,
    thumbnail: p.texture,
  };
}

/**
 * Time-scale applied automatically while piloting. SimClock advances 6 sim-days
 * per real second at speed 1, so this value yields roughly real-time motion
 * (6 * 2e-6 days/s ~= 1 sec/s) — planets read as effectively stationary while
 * you fly between them, instead of streaking past. The player can still adjust
 * the speed slider manually; the pre-flight value is restored on exit.
 */
const PILOT_TIME_SCALE = 0.000002;

interface SimState {
  /** Time-scale multiplier driven by the speed slider. */
  speed: number;
  /** Speed captured when entering the ship, restored on exit (null = none saved). */
  prevSpeed: number | null;
  showOrbits: boolean;
  /** Body data for the info panel, or null when nothing is selected. */
  selected: SelectedBody | null;
  /** Live scene object the camera should frame/follow, or null. */
  focusObject: Object3D | null;
  /** Index into PLANETS of the focused planet, or null (none / a moon). */
  focusIndex: number | null;
  /** Bumped whenever the user asks to reset the camera. */
  resetCounter: number;
  /** Simulation time in days since the J2000 epoch. */
  simTimeDays: number;
  paused: boolean;
  tourActive: boolean;
  /** Master audio volume 0..1 and mute. */
  volume: number;
  muted: boolean;
  /** UI / accessibility. */
  language: Lang;
  showLabels: boolean;
  reducedMotion: boolean;
  settingsOpen: boolean;
  quality: Quality;
  /** Live meshes of planets, keyed by name, for programmatic focus. */
  planetObjects: Record<string, Object3D>;

  /** Phase 8: current scene mode (solar viewer, piloting, descent, surface). */
  sceneMode: SceneMode;
  /** Ship world position in render-space units. */
  shipPosition: [number, number, number];
  /** Ship velocity in render-space units/s. */
  shipVelocity: [number, number, number];
  /** Ship orientation as a quaternion [x, y, z, w]. */
  shipRotation: [number, number, number, number];
  /** Ship throttle 0..1. */
  shipThrottle: number;
  /** Player-tunable flight control feel. */
  controls: ControlConfig;
  /** Quick-nav destination the autopilot is flying toward (body name), or null
   *  when under manual control. Cleared on arrival or any manual input. */
  autopilotTarget: string | null;
  /** Whether the quick-nav destination picker is open (shared so the gamepad's
   *  Nav button can toggle the same sheet the touch button does). */
  navPickerOpen: boolean;

  /** Knowledge journal: discovered POIs keyed by `${planet}:${id}`. */
  discovered: Record<string, true>;
  journal: JournalEntry[];
  mysteryClues: string[];

  /** Phase 11 backpack: carried resource stacks and the total-unit capacity. */
  inventory: Partial<Record<ResourceType, number>>;
  backpackCapacity: number;
  /** Resources dropped on the ground (overflow) awaiting pickup. */
  drops: ResourceDrop[];
  /** Phase 11.1 placed structures (silos + stations) across all bodies. */
  structures: Structure[];
  /** Currently selected buildable for the Place action. */
  activeBuildable: BuildableId;
  /** Phase 11.2 crafted items, and the resources ever discovered (recipe reveal). */
  items: Partial<Record<CraftedItem, number>>;
  seenResources: Partial<Record<ResourceType, true>>;
  /** Creative mode: placement ignores resource/item costs entirely. */
  creativeMode: boolean;

  setSpeed: (speed: number) => void;
  toggleOrbits: () => void;
  select: (body: SelectedBody, object: Object3D) => void;
  reset: () => void;
  advanceTime: (deltaDays: number) => void;
  togglePause: () => void;
  registerPlanet: (name: string, object: Object3D) => void;
  focusPlanetByIndex: (index: number) => void;
  cycleFocus: (dir: 1 | -1) => void;
  toggleTour: () => void;
  setVolume: (v: number) => void;
  toggleMuted: () => void;
  setLanguage: (lang: Lang) => void;
  toggleLabels: () => void;
  setReducedMotion: (v: boolean) => void;
  toggleSettings: () => void;
  setDate: (date: Date) => void;
  setQuality: (q: Quality) => void;
  enterShip: () => void;
  exitShip: () => void;
  beginDescent: (target: string) => boolean;
  setDescentPhase: (phase: 'orbit' | 'atmosphere' | 'landing') => void;
  completeLanding: (planet: string) => void;
  disembark: () => void;
  boardShip: () => void;
  beginAscent: () => void;
  completeAscent: () => void;
  abortDescent: () => void;
  setShipPosition: (pos: [number, number, number]) => void;
  setShipVelocity: (vel: [number, number, number]) => void;
  setShipRotation: (rot: [number, number, number, number]) => void;
  setShipThrottle: (t: number) => void;
  setControls: (partial: Partial<ControlConfig>) => void;
  /** Begin quick-nav autopilot toward a body (no-op unless piloting). */
  startAutopilot: (target: string) => void;
  /** Hand control back to the player (arrival, cancel button, or manual input). */
  cancelAutopilot: () => void;
  setNavPickerOpen: (open: boolean) => void;
  /** Record a scanned POI into the journal; returns true if newly discovered.
   *  Collecting MYSTERY_THRESHOLD clues resolves the cross-body signal. */
  recordDiscovery: (e: {
    planet: string;
    id: string;
    name: string;
    story?: DiscoveryStory;
    clue?: string;
    mysteryId?: string;
  }) => boolean;

  /** Mine a resource: add what fits to the backpack, drop the overflow on the
   *  terrain at `pos`. Returns the amount that overflowed (0 if it all fit). */
  mineResource: (type: ResourceType, amount: number, planet: string, pos: [number, number, number]) => number;
  /** Walk-over pickup of a ground drop; collects only what now fits. Removes the
   *  drop when fully collected. */
  collectDrop: (id: number) => void;
  /** Replace the whole backpack (used by persistence hydration). */
  setInventory: (inv: Partial<Record<ResourceType, number>>) => void;
  /** Intentionally drop a resource stack onto the terrain at `pos` (with a brief
   *  pickup grace so it isn't instantly re-collected). */
  discardResource: (type: ResourceType, amount: number, pos: [number, number, number]) => void;

  /** Phase 11.1 building/storage. */
  setActiveBuildable: (b: BuildableId) => void;
  /** Deduct a resource cost if affordable; returns true on success. */
  spendResources: (cost: Partial<Record<ResourceType, number>>) => boolean;
  addStructure: (s: Structure) => void;
  /** Remove a structure and spill its stored contents as ground drops. */
  removeStructure: (id: number) => void;
  /** Add a resource to a silo up to capacity; returns the amount accepted. */
  siloAbsorb: (id: number, type: ResourceType, amount: number) => number;
  /** Empty the backpack into a silo up to its capacity. */
  depositToStructure: (id: number) => void;
  /** Withdraw a resource from a structure into the backpack, capped by whatever
   *  backpack space is free. Returns the amount actually moved (0 if the
   *  backpack has no room or the structure has none of that resource). */
  withdrawFromStructure: (id: number, type: ResourceType, amount: number) => number;
  /** Move a ground drop into a silo (up to capacity); reduces/removes the drop. */
  absorbDropIntoSilo: (siloId: number, dropId: number) => void;
  setStructures: (structures: Structure[]) => void;

  /** Phase 11.2 crafting. */
  /** Combined resource availability = backpack + silos within pull radius of the
   *  station. Used by the blueprint to show have/need. */
  craftAvailability: (stationId: number) => Partial<Record<ResourceType, number>>;
  /** Craft a recipe at a station: consumes inputs (backpack first, then nearby
   *  silos) and yields the output item. Returns false if unaffordable. */
  craft: (recipeId: string, stationId: number) => boolean;
  setItems: (items: Partial<Record<CraftedItem, number>>) => void;
  setSeenResources: (seen: Partial<Record<ResourceType, true>>) => void;
  setCreativeMode: (v: boolean) => void;

  /** Phase 11.3 base building. */
  /** Deduct a crafted-item cost if affordable; returns true on success. */
  spendItems: (cost: Partial<Record<CraftedItem, number>>) => boolean;
  /** One refinery cycle on a body: each POWERED refinery pulls raw ore from
   *  silos within pull radius and smelts 2 ore -> 1 ingot. */
  refineTick: (planet: string) => void;
}

export const useStore = create<SimState>((set, get) => ({
  speed: 1,
  prevSpeed: null,
  showOrbits: true,
  selected: null,
  focusObject: null,
  focusIndex: null,
  resetCounter: 0,
  simTimeDays: daysSinceJ2000(new Date()),
  paused: false,
  tourActive: false,
  volume: 0.6,
  muted: false,
  language: 'en',
  showLabels: true,
  reducedMotion: prefersReducedMotion,
  settingsOpen: false,
  quality: detectQuality(),
  planetObjects: {},

  sceneMode: { type: 'solar' },
  shipPosition: [0, 50 * WORLD_SCALE, 500 * WORLD_SCALE],
  shipVelocity: [0, 0, 0],
  shipRotation: [0, 0, 0, 1],
  shipThrottle: 0,
  autopilotTarget: null,
  navPickerOpen: false,
  controls: {
    sensitivity: 1,
    deadzone: 0.1,
    invertPitch: false,
    flightAssist: true,
    mouseSensitivity: 1.5,
    fineControl: false,
  },

  ...loadDiscovery(),

  inventory: {},
  backpackCapacity: 50,
  drops: [],
  structures: [],
  activeBuildable: 'block',
  items: {},
  seenResources: {},
  creativeMode: false,

  setSpeed: (speed) => set({ speed }),
  toggleOrbits: () => set((s) => ({ showOrbits: !s.showOrbits })),
  select: (body, object) =>
    set(() => {
      const idx = PLANETS.findIndex((p) => p.name === body.name);
      return { selected: body, focusObject: object, focusIndex: idx >= 0 ? idx : null, tourActive: false };
    }),
  reset: () =>
    set((s) => ({
      selected: null,
      focusObject: null,
      focusIndex: null,
      tourActive: false,
      resetCounter: s.resetCounter + 1,
    })),
  advanceTime: (deltaDays) => set((s) => ({ simTimeDays: s.simTimeDays + deltaDays })),
  togglePause: () => set((s) => ({ paused: !s.paused })),
  registerPlanet: (name, object) =>
    set((s) => ({ planetObjects: { ...s.planetObjects, [name]: object } })),
  focusPlanetByIndex: (index) =>
    set((s) => {
      const p = PLANETS[index];
      const obj = p && s.planetObjects[p.name];
      if (!obj) return {};
      return { focusObject: obj, selected: planetSelected(p), focusIndex: index };
    }),
  cycleFocus: (dir) => {
    const s = get();
    const n = PLANETS.length;
    const next = s.focusIndex == null ? (dir > 0 ? 0 : n - 1) : (s.focusIndex + dir + n) % n;
    s.focusPlanetByIndex(next);
  },
  toggleTour: () => set((s) => ({ tourActive: !s.tourActive })),
  setVolume: (v) => set({ volume: v }),
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
  setLanguage: (language) => set({ language }),
  toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
  setDate: (date) => set({ simTimeDays: daysSinceJ2000(date) }),
  setQuality: (quality) => set({ quality }),

  enterShip: () =>
    set((s) => {
      if (s.sceneMode.type !== 'solar') return {};
      return {
        sceneMode: { type: 'piloting' },
        tourActive: false,
        selected: null,
        focusObject: null,
        focusIndex: null,
        // Drop to near-real-time so planet motion feels natural while flying.
        prevSpeed: s.speed,
        speed: PILOT_TIME_SCALE,
      };
    }),
  exitShip: () =>
    set((s) => {
      if (s.sceneMode.type !== 'piloting') return {};
      return {
        sceneMode: { type: 'solar' },
        resetCounter: s.resetCounter + 1,
        // Restore the time-scale the player had before flying.
        speed: s.prevSpeed ?? s.speed,
        prevSpeed: null,
        autopilotTarget: null,
        navPickerOpen: false,
      };
    }),
  beginDescent: (target: string) => {
    const s = get();
    if (s.sceneMode.type !== 'piloting') return false;
    if (!isLandable(target)) return false;
    set({ sceneMode: { type: 'descending', target, phase: 'orbit' }, autopilotTarget: null });
    return true;
  },
  setDescentPhase: (phase) =>
    set((s) => {
      if (s.sceneMode.type !== 'descending') return {};
      return { sceneMode: { ...s.sceneMode, phase } };
    }),
  completeLanding: (planet: string) => set({ sceneMode: { type: 'surface', planet } }),
  // Step off the ship into the on-foot voxel world (and back).
  disembark: () =>
    set((s) => {
      if (s.sceneMode.type !== 'surface') return {};
      return { sceneMode: { type: 'voxel', planet: s.sceneMode.planet } };
    }),
  boardShip: () =>
    set((s) => {
      if (s.sceneMode.type !== 'voxel') return {};
      return { sceneMode: { type: 'surface', planet: s.sceneMode.planet } };
    }),
  beginAscent: () =>
    set((s) => {
      if (s.sceneMode.type !== 'surface') return {};
      return { sceneMode: { type: 'ascending', planet: s.sceneMode.planet } };
    }),
  completeAscent: () => set({ sceneMode: { type: 'piloting' } }),
  abortDescent: () => set({ sceneMode: { type: 'piloting' } }),
  setShipPosition: (shipPosition) => set({ shipPosition }),
  setShipVelocity: (shipVelocity) => set({ shipVelocity }),
  setShipRotation: (shipRotation) => set({ shipRotation }),
  setShipThrottle: (shipThrottle) => set({ shipThrottle }),
  setControls: (partial) => set((s) => ({ controls: { ...s.controls, ...partial } })),
  startAutopilot: (target) =>
    set((s) => (s.sceneMode.type === 'piloting' ? { autopilotTarget: target, navPickerOpen: false } : {})),
  cancelAutopilot: () => set((s) => (s.autopilotTarget ? { autopilotTarget: null } : {})),
  setNavPickerOpen: (navPickerOpen) => set({ navPickerOpen }),
  recordDiscovery: (e) => {
    const s = get();
    const key = `${e.planet}:${e.id}`;
    if (s.discovered[key]) return false;

    const discovered: Record<string, true> = { ...s.discovered, [key]: true };
    let journal: JournalEntry[] = [
      { key, planet: e.planet, name: e.name, story: e.story, clue: e.clue, ts: Date.now() },
      ...s.journal,
    ];
    let mysteryClues = s.mysteryClues;
    if (e.clue) {
      const mid = e.mysteryId ?? e.id;
      const tag = `${mid}:${e.id}`; // unique per POI, grouped by mystery
      if (!mysteryClues.includes(tag)) mysteryClues = [...mysteryClues, tag];
      const res = MYSTERY_RESOLUTIONS[mid];
      const resKey = `mystery:${mid}`;
      if (res && !discovered[resKey]) {
        const count = mysteryClues.filter((c) => c.startsWith(`${mid}:`)).length;
        if (count >= MYSTERY_THRESHOLD) {
          discovered[resKey] = true;
          journal = [
            { key: resKey, planet: '', name: res.name, story: res.story, ts: Date.now() },
            ...journal,
          ];
        }
      }
    }

    saveDiscovery({ discovered, journal, mysteryClues });
    set({ discovered, journal, mysteryClues });
    return true;
  },

  mineResource: (type, amount, planet, pos) => {
    const s = get();
    const space = Math.max(0, s.backpackCapacity - backpackUsed(s.inventory));
    const added = Math.min(amount, space);
    const overflow = amount - added;
    // Mark the resource discovered (reveals its gated recipes), even if the pack
    // is full and the yield overflows — you've still seen it.
    const seenResources = s.seenResources[type] ? s.seenResources : { ...s.seenResources, [type]: true as const };
    if (added > 0) {
      set({ inventory: { ...s.inventory, [type]: (s.inventory[type] ?? 0) + added }, seenResources });
    } else if (seenResources !== s.seenResources) {
      set({ seenResources });
    }
    if (overflow > 0) {
      const drop: ResourceDrop = { id: nextDropId++, planet, pos, type, amount: overflow };
      set((st) => ({ drops: [...st.drops, drop] }));
    }
    return overflow;
  },
  collectDrop: (id) => {
    const s = get();
    const drop = s.drops.find((d) => d.id === id);
    if (!drop) return;
    const space = Math.max(0, s.backpackCapacity - backpackUsed(s.inventory));
    if (space <= 0) return;
    const taken = Math.min(drop.amount, space);
    const inventory = { ...s.inventory, [drop.type]: (s.inventory[drop.type] ?? 0) + taken };
    const remaining = drop.amount - taken;
    const drops =
      remaining > 0
        ? s.drops.map((d) => (d.id === id ? { ...d, amount: remaining } : d))
        : s.drops.filter((d) => d.id !== id);
    set({ inventory, drops });
  },
  setInventory: (inventory) => set({ inventory }),
  discardResource: (type, amount, pos) => {
    const s = get();
    const have = s.inventory[type] ?? 0;
    const drop = Math.min(amount, have);
    if (drop <= 0) return;
    const inventory = { ...s.inventory, [type]: have - drop };
    if ((inventory[type] ?? 0) <= 0) delete inventory[type];
    const planet = s.sceneMode.type === 'voxel' ? s.sceneMode.planet : '';
    const entry: ResourceDrop = {
      id: nextDropId++,
      planet,
      pos,
      type,
      amount: drop,
      noPickupUntil: Date.now() + 4000,
    };
    set({ inventory, drops: [...s.drops, entry] });
  },

  setActiveBuildable: (activeBuildable) => set({ activeBuildable }),
  spendResources: (cost) => {
    const s = get();
    for (const k in cost) {
      const type = k as ResourceType;
      if ((s.inventory[type] ?? 0) < (cost[type] ?? 0)) return false;
    }
    const inventory = { ...s.inventory };
    for (const k in cost) {
      const type = k as ResourceType;
      inventory[type] = (inventory[type] ?? 0) - (cost[type] ?? 0);
    }
    set({ inventory });
    return true;
  },
  addStructure: (structure) => set((s) => ({ structures: [...s.structures, structure] })),
  removeStructure: (id) => {
    const s = get();
    const st = s.structures.find((x) => x.id === id);
    if (!st) return;
    // Spill stored contents as ground drops at the structure.
    const newDrops: ResourceDrop[] = [];
    for (const k in st.stored) {
      const type = k as ResourceType;
      const amount = st.stored[type] ?? 0;
      if (amount > 0) {
        newDrops.push({ id: nextDropId++, planet: st.planet, pos: st.pos, type, amount });
      }
    }
    set({
      structures: s.structures.filter((x) => x.id !== id),
      drops: newDrops.length ? [...s.drops, ...newDrops] : s.drops,
    });
  },
  siloAbsorb: (id, type, amount) => {
    const s = get();
    const st = s.structures.find((x) => x.id === id);
    if (!st) return 0;
    const space = Math.max(0, st.capacity - structureUsed(st));
    const accepted = Math.min(amount, space);
    if (accepted <= 0) return 0;
    set({
      structures: s.structures.map((x) =>
        x.id === id ? { ...x, stored: { ...x.stored, [type]: (x.stored[type] ?? 0) + accepted } } : x,
      ),
    });
    return accepted;
  },
  depositToStructure: (id) => {
    const s = get();
    const st = s.structures.find((x) => x.id === id);
    if (!st) return;
    let space = Math.max(0, st.capacity - structureUsed(st));
    if (space <= 0) return;
    const inventory = { ...s.inventory };
    const stored = { ...st.stored };
    for (const k in inventory) {
      if (space <= 0) break;
      const type = k as ResourceType;
      const have = inventory[type] ?? 0;
      const move = Math.min(have, space);
      if (move <= 0) continue;
      inventory[type] = have - move;
      stored[type] = (stored[type] ?? 0) + move;
      space -= move;
    }
    set({
      inventory,
      structures: s.structures.map((x) => (x.id === id ? { ...x, stored } : x)),
    });
  },
  withdrawFromStructure: (id, type, amount) => {
    const s = get();
    const st = s.structures.find((x) => x.id === id);
    if (!st) return 0;
    const haveInStructure = st.stored[type] ?? 0;
    const want = Math.min(amount, haveInStructure);
    if (want <= 0) return 0;
    const space = Math.max(0, s.backpackCapacity - backpackUsed(s.inventory));
    const taken = Math.min(want, space);
    if (taken <= 0) return 0;
    const stored = { ...st.stored, [type]: haveInStructure - taken };
    if ((stored[type] ?? 0) <= 0) delete stored[type];
    const inventory = { ...s.inventory, [type]: (s.inventory[type] ?? 0) + taken };
    set({
      inventory,
      structures: s.structures.map((x) => (x.id === id ? { ...x, stored } : x)),
    });
    return taken;
  },
  absorbDropIntoSilo: (siloId, dropId) => {
    const s = get();
    const silo = s.structures.find((x) => x.id === siloId);
    const drop = s.drops.find((d) => d.id === dropId);
    if (!silo || !drop) return;
    const space = Math.max(0, silo.capacity - structureUsed(silo));
    const accepted = Math.min(drop.amount, space);
    if (accepted <= 0) return;
    const structures = s.structures.map((x) =>
      x.id === siloId
        ? { ...x, stored: { ...x.stored, [drop.type]: (x.stored[drop.type] ?? 0) + accepted } }
        : x,
    );
    const remaining = drop.amount - accepted;
    const drops =
      remaining > 0
        ? s.drops.map((d) => (d.id === dropId ? { ...d, amount: remaining } : d))
        : s.drops.filter((d) => d.id !== dropId);
    set({ structures, drops });
  },
  setStructures: (structures) => {
    // Keep the id source ahead of any restored ids so new placements don't clash.
    for (const s of structures) if (s.id >= nextDropId) nextDropId = s.id + 1;
    set({ structures });
  },

  craftAvailability: (stationId) => {
    const s = get();
    const station = s.structures.find((x) => x.id === stationId);
    const out: Partial<Record<ResourceType, number>> = { ...s.inventory };
    if (!station) return out;
    for (const silo of s.structures) {
      if (silo.type !== 'silo' || silo.planet !== station.planet) continue;
      if (dist2(silo.pos, station.pos) >= PULL_RADIUS_SQ) continue;
      for (const k in silo.stored) {
        const res = k as ResourceType;
        out[res] = (out[res] ?? 0) + (silo.stored[res] ?? 0);
      }
    }
    return out;
  },
  craft: (recipeId, stationId) => {
    const s = get();
    const recipe = recipeById(recipeId);
    const station = s.structures.find((x) => x.id === stationId && x.type === 'station');
    if (!recipe || !station) return false;
    const silos = s.structures.filter(
      (x) =>
        x.type === 'silo' &&
        x.planet === station.planet &&
        dist2(x.pos, station.pos) < PULL_RADIUS_SQ,
    );
    // Affordability across backpack + nearby silos.
    for (const k in recipe.inputs) {
      const res = k as ResourceType;
      let have = s.inventory[res] ?? 0;
      for (const silo of silos) have += silo.stored[res] ?? 0;
      if (have < (recipe.inputs[res] ?? 0)) return false;
    }
    // Consume: backpack first, then silos in order.
    const inventory = { ...s.inventory };
    const siloStored = new Map(silos.map((x) => [x.id, { ...x.stored }]));
    for (const k in recipe.inputs) {
      const res = k as ResourceType;
      let need = recipe.inputs[res] ?? 0;
      const fromPack = Math.min(need, inventory[res] ?? 0);
      inventory[res] = (inventory[res] ?? 0) - fromPack;
      if ((inventory[res] ?? 0) <= 0) delete inventory[res];
      need -= fromPack;
      for (const silo of silos) {
        if (need <= 0) break;
        const stored = siloStored.get(silo.id)!;
        const take = Math.min(need, stored[res] ?? 0);
        if (take > 0) {
          stored[res] = (stored[res] ?? 0) - take;
          if ((stored[res] ?? 0) <= 0) delete stored[res];
          need -= take;
        }
      }
    }
    const structures = s.structures.map((x) =>
      siloStored.has(x.id) ? { ...x, stored: siloStored.get(x.id)! } : x,
    );
    const items = {
      ...s.items,
      [recipe.output]: (s.items[recipe.output] ?? 0) + recipe.qty,
    };
    set({ inventory, structures, items });
    return true;
  },
  setItems: (items) => set({ items }),
  setSeenResources: (seenResources) => set({ seenResources }),
  setCreativeMode: (creativeMode) => set({ creativeMode }),

  spendItems: (cost) => {
    const s = get();
    for (const k in cost) {
      const item = k as CraftedItem;
      if ((s.items[item] ?? 0) < (cost[item] ?? 0)) return false;
    }
    const items = { ...s.items };
    for (const k in cost) {
      const item = k as CraftedItem;
      items[item] = (items[item] ?? 0) - (cost[item] ?? 0);
      if ((items[item] ?? 0) <= 0) delete items[item];
    }
    set({ items });
    return true;
  },
  refineTick: (planet) => {
    const s = get();
    const { poweredRefineries } = planetPower(s.structures, planet);
    if (poweredRefineries <= 0) return;
    const refineries = s.structures
      .filter((x) => x.type === 'refinery' && x.planet === planet)
      .slice(0, poweredRefineries);
    if (refineries.length === 0) return;

    const siloStored = new Map<number, Partial<Record<ResourceType, number>>>();
    const items = { ...s.items };
    let smelted = false;

    for (const ref of refineries) {
      const silos = s.structures.filter(
        (x) => x.type === 'silo' && x.planet === planet && dist2(x.pos, ref.pos) < PULL_RADIUS_SQ,
      );
      // Smelt the first ore type this refinery can fully source this cycle.
      outer: for (const { ore, ingot } of SMELT) {
        let need = SMELT_RATIO;
        // Dry-run availability across the silos (respecting earlier takes).
        let have = 0;
        for (const silo of silos) {
          const stored = siloStored.get(silo.id) ?? silo.stored;
          have += stored[ore] ?? 0;
        }
        if (have < need) continue;
        for (const silo of silos) {
          if (need <= 0) break;
          const stored = siloStored.get(silo.id) ?? { ...silo.stored };
          const take = Math.min(need, stored[ore] ?? 0);
          if (take > 0) {
            stored[ore] = (stored[ore] ?? 0) - take;
            if ((stored[ore] ?? 0) <= 0) delete stored[ore];
            siloStored.set(silo.id, stored);
            need -= take;
          }
        }
        items[ingot] = (items[ingot] ?? 0) + 1;
        smelted = true;
        break outer;
      }
    }

    if (!smelted) return;
    const structures = s.structures.map((x) =>
      siloStored.has(x.id) ? { ...x, stored: siloStored.get(x.id)! } : x,
    );
    set({ items, structures });
  },
}));

/** Monotonic id source for ground drops + structures. */
let nextDropId = 1;
export function nextStructureId(): number {
  return nextDropId++;
}

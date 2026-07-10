import { create } from 'zustand';
import type { Object3D } from 'three';
import { daysSinceJ2000, periodDays } from './systems/ephemeris';
import { PLANETS, isLandable, WORLD_SCALE, type PlanetData } from './systems/bodies';
import type { ResourceType } from './voxel/voxelTypes';
import type { BuildableId } from './voxel/buildables';
import { recipeById, type CraftedItem } from './voxel/recipes';
import { planetPower } from './voxel/power';
import { saveMode, saveUpgrades, saveInventory, saveItems, saveActiveTool, saveFlashlightOn } from './voxel/persistence';
import {
  UPGRADE_COSTS,
  UPGRADE_MAX_TIER,
  CARGO_CAPACITY_PER_TIER,
  DEFAULT_UPGRADES,
  canDescend,
  type UpgradeKind,
  type ShipUpgrades,
} from './ship/upgrades';

/** Item wheel: the three on-foot equippable tools. */
export type VoxelTool = 'pickaxe' | 'gun' | 'flashlight';

/** Backpack capacity with no cargo upgrades. */
const BASE_BACKPACK_CAPACITY = 50;

/** Default "Mouse/touch sensitivity" setting. The flight look code
 *  (ship/cameraLook.ts, ship/virtualStick.ts) scales its tuned gain by
 *  `mouseSensitivity / DEFAULT_MOUSE_SENSITIVITY` so the feel at this default
 *  matches what was previously hardcoded. */
export const DEFAULT_MOUSE_SENSITIVITY = 1.5;

/** Capacity is always a pure function of the cargo tier, so hydration and
 *  upgrades can never drift apart (the tier is what's persisted, not the
 *  capacity). */
function backpackCapacityFor(upgrades: ShipUpgrades): number {
  return BASE_BACKPACK_CAPACITY + upgrades.cargo * CARGO_CAPACITY_PER_TIER;
}

/** Raw ore -> smelted ingot conversions the refinery performs. */
const SMELT: Array<{ ore: ResourceType; ingot: CraftedItem }> = [
  { ore: 'iron', ingot: 'iron_ingot' },
  { ore: 'copper', ingot: 'copper_ingot' },
];
/** Raw units consumed per ingot. */
const SMELT_RATIO = 2;

/** Radius (voxels) within which a crafting station pulls from nearby silos. */
const PULL_RADIUS_SQ = 12 * 12;

/** Phase 11.6 passive producers: units/second while powered. Deliberately
 *  slow — these are meant to reward leaving the base running, not to replace
 *  hand-mining as the fast path. */
const EXTRACT_RATE = 1 / 6;
const CONDENSE_RATE = 1 / 10;
/** Cap on how much real-world elapsed time an offline catch-up will honor
 *  (72h). A determined player can still repeat the exploit of winding a
 *  device clock forward and reloading, but this bounds each single "jump" to
 *  a plausible away-from-the-game absence rather than an unbounded windfall,
 *  and negative/zero elapsed time (clock wound backward) is clamped to 0 by
 *  the caller. This is a soft mitigation, not a fix — there is no trusted
 *  clock available client-side. */
export const MAX_OFFLINE_SECONDS = 72 * 3600;

/** Advance one producer's fractional progress by `elapsedSec` at `rate`
 *  units/sec, depositing whole units into its own storage (capped at
 *  capacity). Returns the updated structure and any whole units that didn't
 *  fit, for the caller to spill (ground drop) or discard (offline cap). */
function advanceProducer(
  st: Structure,
  elapsedSec: number,
  rate: number,
): { structure: Structure; overflow: number } {
  if (!st.resourceType || elapsedSec <= 0) return { structure: st, overflow: 0 };
  const progress = (st.progress ?? 0) + elapsedSec * rate;
  const whole = Math.floor(progress);
  if (whole <= 0) return { structure: { ...st, progress }, overflow: 0 };
  const space = Math.max(0, st.capacity - structureUsed(st));
  const added = Math.min(whole, space);
  const overflow = whole - added;
  const stored =
    added > 0
      ? { ...st.stored, [st.resourceType]: (st.stored[st.resourceType] ?? 0) + added }
      : st.stored;
  return { structure: { ...st, stored, progress: progress - whole }, overflow };
}

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
  disruption?: string;
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
  /** True for Layer 2 (fictional deep-discovery) entries — read directly off
   *  the data, never inferred, so the UI can never blur real science with
   *  invented sci-fi content. */
  speculative?: boolean;
}

/** Phase 10.5 — Mystery & Narrative System. A recorded war-lore discovery.
 *  Deliberately does NOT store rendered text: the journal re-renders
 *  corruptedText/trueMeaning live off the current translation tier (see
 *  translationTier() below), so a fragment unlock is a re-render, not a data
 *  migration. Wholly separate from JournalEntry/DiscoveryStory above. */
export interface WarLoreEntry {
  key: string;
  planet: string;
  name: string;
  act: number;
  ts: number;
  /** Flagged true on discovery and again, retroactively, whenever a new
   *  Translation Fragment raises the tier past this entry's requirement. */
  unread: boolean;
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
  | 'refinery'
  | 'tether'
  | 'extractor'
  | 'condenser';

export interface Structure {
  id: number;
  planet: string;
  type: StructureType;
  /** World voxel of the core (anchor). */
  pos: [number, number, number];
  stored: Partial<Record<ResourceType, number>>;
  capacity: number;
  /** Extractor/condenser only: the resource it produces, fixed at placement
   *  time from the vein/atmosphere under it (see scanOreDirection use in
   *  ChunkManager's placeApi). Absent for every other structure type. */
  resourceType?: ResourceType;
  /** Extractor/condenser only: fractional progress (0..1) toward the next
   *  unit, carried across ticks so slow rates still accumulate smoothly. */
  progress?: number;
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

// --- Phase 10.5 — Mystery & Narrative System (war-lore thread) -------------
// Persisted separately from DiscoveryState above: a distinct narrative thread
// with its own journal, its own discovery set, and a translation-tier gate
// that DiscoveryState has no concept of.
interface NarrativeState {
  warLoreDiscovered: Record<string, true>;
  warLoreJournal: WarLoreEntry[];
  /** Ids of collected Translation Fragments (not crafted/purchased — found). */
  translationFragmentsFound: string[];
  /** Set once the player finds either Act 8 Hidden Exodus Cache (Pluto or
   *  Charon). Distinct from the ship's Quantum Drive propulsion upgrade
   *  (ship/upgrades.ts) — this flag is the story's FTL-drive/quarantine
   *  resolution and must never be conflated with it. */
  ftlUnlocked: boolean;
}

const NARRATIVE_KEY = 'solarsystem.narrative.v1';
/** Fragments needed before the Xenolinguistic Decoder reaches tier 2 (full
 *  translation). Matches MYSTERY_THRESHOLD's convention of "3 finds". */
export const TRANSLATION_FRAGMENT_THRESHOLD = 3;

/** Derived, not stored: the decoder's tier is always a pure function of which
 *  fragments have been found, so nothing can desync from it. */
export function translationTier(fragmentsFound: string[]): number {
  return fragmentsFound.length >= TRANSLATION_FRAGMENT_THRESHOLD ? 2 : 1;
}

function loadNarrative(): NarrativeState {
  const empty: NarrativeState = {
    warLoreDiscovered: {},
    warLoreJournal: [],
    translationFragmentsFound: [],
    ftlUnlocked: false,
  };
  if (typeof window === 'undefined') return empty;
  try {
    const raw = window.localStorage.getItem(NARRATIVE_KEY);
    if (!raw) return empty;
    const p = JSON.parse(raw) as Partial<NarrativeState>;
    return {
      warLoreDiscovered: p.warLoreDiscovered ?? {},
      warLoreJournal: p.warLoreJournal ?? [],
      translationFragmentsFound: p.translationFragmentsFound ?? [],
      ftlUnlocked: p.ftlUnlocked ?? false,
    };
  } catch {
    return empty;
  }
}

function saveNarrative(n: NarrativeState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(NARRATIVE_KEY, JSON.stringify(n));
  } catch {
    /* storage full / unavailable — narrative progress just won't persist */
  }
}

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

// --- Persisted UI preferences (small, synchronous — same pattern as the
// discovery/narrative records above). Currently just the camera FOV. ---
const UIPREFS_KEY = 'solarsystem.uiprefs.v1';
export const FOV_MIN = 60;
export const FOV_MAX = 100;
export const FOV_DEFAULT = 75;

function loadUiPrefs(): { fov: number } {
  if (typeof window === 'undefined') return { fov: FOV_DEFAULT };
  try {
    const raw = window.localStorage.getItem(UIPREFS_KEY);
    if (!raw) return { fov: FOV_DEFAULT };
    const p = JSON.parse(raw) as { fov?: number };
    const fov = typeof p.fov === 'number' ? Math.min(FOV_MAX, Math.max(FOV_MIN, p.fov)) : FOV_DEFAULT;
    return { fov };
  } catch {
    return { fov: FOV_DEFAULT };
  }
}

function saveUiPrefs(p: { fov: number }): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(UIPREFS_KEY, JSON.stringify(p));
  } catch {
    /* storage full / unavailable — the preference just won't persist */
  }
}

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
  /** Base camera field of view in degrees (60–100); persisted. */
  fov: number;
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
  /** Item wheel: which on-foot tool is equipped. Mining only runs when this is
   *  'pickaxe'; the gun's alt-mining tick only runs when it's 'gun'. */
  activeTool: VoxelTool;
  /** Whether the flashlight is currently lit — independent of whether it's the
   *  equipped tool, so re-equipping it doesn't force it back on. */
  flashlightOn: boolean;
  /** Creative mode (the default): placement ignores resource/item costs and no
   *  survival mechanics (oxygen/tethers/death) apply. Survival is opt-in. */
  creativeMode: boolean;
  /** Phase 11.4 survival — oxygen supply as a 0..1 fraction of O2_MAX_SECONDS.
   *  Only simulated (and only shown) in survival mode. */
  oxygen: number;
  /** Whether the player currently stands in a safe zone (ship / powered
   *  habitat / connected tether) — drives the HUD refill indicator. */
  oxygenSafe: boolean;
  /** Set when the player blacks out; the HUD renders the explanation overlay.
   *  Cleared on dismiss. Distances are metres from the nearest safety point. */
  survivalDeath: { dist: number; anchor: 'habitat' | 'ship' } | null;

  /** Phase 11.5 ship upgrades — tiers 0-3. Shielding hard-gates a handful of
   *  hostile bodies; scanner/cargo scale a convenience. Quantum Drive imposes
   *  no in-system restriction (see ship/upgrades.ts). */
  shipUpgrades: ShipUpgrades;
  /** Set for a few seconds when Land is pressed but shielding blocks it, so the
   *  HUD can explain why instead of the button silently doing nothing. */
  descentBlocked: { reason: 'shielding' } | null;

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
  setFov: (fov: number) => void;
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
    speculative?: boolean;
  }) => boolean;

  // --- Phase 10.5 — Mystery & Narrative System (separate from the discovery
  // journal above; see WarLoreEntry). ---
  warLoreDiscovered: Record<string, true>;
  warLoreJournal: WarLoreEntry[];
  translationFragmentsFound: string[];
  /** Story-level FTL unlock (Act 8) — distinct from the ship's Quantum Drive
   *  propulsion upgrade. */
  ftlUnlocked: boolean;
  /** Transient toast shown on a Translation Fragment find; the UI clears it
   *  after display via dismissWarLoreToast. */
  warLoreToast: { message: string; id: number } | null;
  /** Record a scanned war-lore POI into the war-lore journal. Returns true if
   *  newly discovered. Act 8 sets ftlUnlocked. */
  recordWarLoreDiscovery: (e: { planet: string; id: string; name: string; act: number }) => boolean;
  /** Collect a Translation Fragment. If this raises the global translation
   *  tier, every existing journal entry is retroactively flagged unread (the
   *  text itself re-renders live off the new tier — no journal rewrite here)
   *  and a toast is queued. Returns true if newly collected. */
  collectTranslationFragment: (id: string, act: number) => boolean;
  /** Mark one war-lore entry (or, with no key, all of them) as read. */
  markWarLoreRead: (key?: string) => void;
  dismissWarLoreToast: () => void;

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
  /** Replace one body's drops with a restored list (persistence hydration). */
  setDropsForPlanet: (planet: string, drops: ResourceDrop[]) => void;

  /** Phase 11.2 crafting. */
  /** Combined resource availability = backpack + silos within pull radius of the
   *  station. Used by the blueprint to show have/need. */
  craftAvailability: (stationId: number) => Partial<Record<ResourceType, number>>;
  /** Craft a recipe at a station: consumes inputs (backpack first, then nearby
   *  silos) and yields the output item. Returns false if unaffordable. */
  craft: (recipeId: string, stationId: number) => boolean;
  setItems: (items: Partial<Record<CraftedItem, number>>) => void;
  setSeenResources: (seen: Partial<Record<ResourceType, true>>) => void;
  setActiveTool: (tool: VoxelTool) => void;
  setFlashlightOn: (on: boolean) => void;
  setCreativeMode: (v: boolean) => void;

  /** Phase 11.4 survival. */
  setOxygen: (v: number) => void;
  setOxygenSafe: (v: boolean) => void;
  setSurvivalDeath: (d: { dist: number; anchor: 'habitat' | 'ship' } | null) => void;

  /** Phase 11.5. Spend the next tier's cost and advance one tier; returns
   *  false (no change) if unaffordable or already at max. */
  upgradeShip: (kind: UpgradeKind) => boolean;
  /** Persistence hydration. */
  setShipUpgrades: (u: ShipUpgrades) => void;
  setDescentBlocked: (b: { reason: 'shielding' } | null) => void;

  /** Phase 11.3 base building. */
  /** Deduct a crafted-item cost if affordable; returns true on success. */
  spendItems: (cost: Partial<Record<CraftedItem, number>>) => boolean;
  /** One refinery cycle on a body: each POWERED refinery pulls raw ore from
   *  silos within pull radius and smelts 2 ore -> 1 ingot. */
  refineTick: (planet: string) => void;

  /** Phase 11.6 passive producers. Advances every POWERED extractor/condenser
   *  on the body by `elapsedSec` of real time, depositing into its own
   *  storage (spilling to the ground once full, same as mining overflow). */
  extractTick: (planet: string, elapsedSec: number) => void;
  /** Assign the resource an extractor/condenser produces at placement time
   *  (fixed for the structure's lifetime — mirrors how a silo's capacity is
   *  fixed at placement). */
  setStructureResource: (id: number, resourceType: ResourceType) => void;
  /** Catch-up production for every producer on a body across a real-world gap
   *  (e.g. the app was closed). Called once when a body's structures are
   *  loaded; `elapsedSec` is clamped by the caller before being passed in. */
  applyOfflineProduction: (planet: string, elapsedSec: number) => void;
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
  fov: loadUiPrefs().fov,
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
    mouseSensitivity: DEFAULT_MOUSE_SENSITIVITY,
    fineControl: false,
  },

  ...loadDiscovery(),
  ...loadNarrative(),
  warLoreToast: null,

  inventory: {},
  backpackCapacity: BASE_BACKPACK_CAPACITY,
  drops: [],
  structures: [],
  activeBuildable: 'block',
  items: {},
  seenResources: {},
  activeTool: 'pickaxe',
  flashlightOn: false,
  // Creative is the default experience; survival is an explicit opt-in
  // (Settings). Hydrated from persistence in App so the choice sticks.
  creativeMode: true,
  oxygen: 1,
  oxygenSafe: true,
  survivalDeath: null,
  shipUpgrades: { ...DEFAULT_UPGRADES },
  descentBlocked: null,

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
  setFov: (fov) => {
    const clamped = Math.min(FOV_MAX, Math.max(FOV_MIN, fov));
    set({ fov: clamped });
    saveUiPrefs({ fov: clamped });
  },

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
    const gate = canDescend(target, s.shipUpgrades);
    if (!gate.ok) {
      set({ descentBlocked: { reason: gate.reason! } });
      return false;
    }
    set({
      sceneMode: { type: 'descending', target, phase: 'orbit' },
      autopilotTarget: null,
      descentBlocked: null,
    });
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
      {
        key,
        planet: e.planet,
        name: e.name,
        story: e.story,
        clue: e.clue,
        ts: Date.now(),
        speculative: e.speculative,
      },
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

  recordWarLoreDiscovery: (e) => {
    const s = get();
    const key = `${e.planet}:${e.id}`;
    if (s.warLoreDiscovered[key]) return false;

    const warLoreDiscovered: Record<string, true> = { ...s.warLoreDiscovered, [key]: true };
    const warLoreJournal: WarLoreEntry[] = [
      { key, planet: e.planet, name: e.name, act: e.act, ts: Date.now(), unread: true },
      ...s.warLoreJournal,
    ];
    const ftlUnlocked = s.ftlUnlocked || e.act === 8;

    saveNarrative({
      warLoreDiscovered,
      warLoreJournal,
      translationFragmentsFound: s.translationFragmentsFound,
      ftlUnlocked,
    });
    set({ warLoreDiscovered, warLoreJournal, ftlUnlocked });
    return true;
  },

  collectTranslationFragment: (id) => {
    const s = get();
    if (s.translationFragmentsFound.includes(id)) return false;

    const prevTier = translationTier(s.translationFragmentsFound);
    const translationFragmentsFound = [...s.translationFragmentsFound, id];
    const newTier = translationTier(translationFragmentsFound);

    let warLoreJournal = s.warLoreJournal;
    let warLoreToast = s.warLoreToast;
    if (newTier > prevTier && warLoreJournal.length > 0) {
      // Retroactive update: flag every already-scanned entry unread. The text
      // itself is never rewritten here — the journal UI renders it live off
      // the new tier, so this is purely a "you have something new to read" flag.
      warLoreJournal = warLoreJournal.map((entry) => ({ ...entry, unread: true }));
      warLoreToast = {
        message: `Translation Matrix Updated — ${warLoreJournal.length} previous logs re-interpreted`,
        id: Date.now(),
      };
    }

    saveNarrative({
      warLoreDiscovered: s.warLoreDiscovered,
      warLoreJournal,
      translationFragmentsFound,
      ftlUnlocked: s.ftlUnlocked,
    });
    set({ translationFragmentsFound, warLoreJournal, warLoreToast });
    return true;
  },

  markWarLoreRead: (key) => {
    const s = get();
    const warLoreJournal = s.warLoreJournal.map((entry) =>
      key === undefined || entry.key === key ? { ...entry, unread: false } : entry,
    );
    saveNarrative({
      warLoreDiscovered: s.warLoreDiscovered,
      warLoreJournal,
      translationFragmentsFound: s.translationFragmentsFound,
      ftlUnlocked: s.ftlUnlocked,
    });
    set({ warLoreJournal });
  },

  dismissWarLoreToast: () => set({ warLoreToast: null }),

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
  setDropsForPlanet: (planet, restored) => {
    for (const d of restored) if (d.id >= nextDropId) nextDropId = d.id + 1;
    set((s) => ({ drops: [...s.drops.filter((d) => d.planet !== planet), ...restored] }));
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
    // Persist the transaction right away, mirroring upgradeShip — a craft
    // followed by a crash/refresh must not refund the inputs.
    void saveInventory(inventory);
    void saveItems(items);
    return true;
  },
  setItems: (items) => set({ items }),
  setSeenResources: (seenResources) => set({ seenResources }),
  setActiveTool: (activeTool) => {
    set({ activeTool });
    void saveActiveTool(activeTool);
  },
  setFlashlightOn: (flashlightOn) => {
    set({ flashlightOn });
    void saveFlashlightOn(flashlightOn);
  },
  setCreativeMode: (creativeMode) => {
    // Entering survival always starts with a full supply; leaving it clears any
    // lingering death overlay so creative shows zero survival UI.
    set(
      creativeMode
        ? { creativeMode, survivalDeath: null }
        : { creativeMode, oxygen: 1, oxygenSafe: true, survivalDeath: null },
    );
    void saveMode(creativeMode);
  },
  setOxygen: (oxygen) => set({ oxygen }),
  setOxygenSafe: (oxygenSafe) => set({ oxygenSafe }),
  setSurvivalDeath: (survivalDeath) => set({ survivalDeath }),

  upgradeShip: (kind) => {
    const s = get();
    const tier = s.shipUpgrades[kind];
    if (tier >= UPGRADE_MAX_TIER) return false;
    const cost = UPGRADE_COSTS[kind][tier]; // cost FROM `tier` TO `tier + 1`
    // Afford-check both resources and items before deducting either, so an
    // upgrade attempt never partially spends on failure.
    for (const k in cost.resources) {
      const t = k as ResourceType;
      if ((s.inventory[t] ?? 0) < (cost.resources[t] ?? 0)) return false;
    }
    if (cost.items) {
      for (const k in cost.items) {
        const t = k as CraftedItem;
        if ((s.items[t] ?? 0) < (cost.items[t] ?? 0)) return false;
      }
    }
    if (!s.spendResources(cost.resources)) return false;
    if (cost.items) s.spendItems(cost.items);
    const shipUpgrades = { ...s.shipUpgrades, [kind]: tier + 1 };
    set({ shipUpgrades, backpackCapacity: backpackCapacityFor(shipUpgrades) });
    void saveUpgrades(shipUpgrades);
    // Persist the spend immediately — the ChunkManager's save only runs in the
    // voxel scene, and an upgrade bought while piloting must not "refund" the
    // resources on the next reload.
    const after = get();
    void saveInventory(after.inventory);
    void saveItems(after.items);
    return true;
  },
  setShipUpgrades: (shipUpgrades) =>
    set({ shipUpgrades, backpackCapacity: backpackCapacityFor(shipUpgrades) }),
  setDescentBlocked: (descentBlocked) => set({ descentBlocked }),

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

  setStructureResource: (id, resourceType) =>
    set((s) => ({
      structures: s.structures.map((x) => (x.id === id ? { ...x, resourceType } : x)),
    })),

  extractTick: (planet, elapsedSec) => {
    const s = get();
    const { poweredExtractors, poweredCondensers } = planetPower(s.structures, planet);
    if (poweredExtractors <= 0 && poweredCondensers <= 0) return;
    const extractors = s.structures
      .filter((x) => x.type === 'extractor' && x.planet === planet)
      .slice(0, poweredExtractors);
    const condensers = s.structures
      .filter((x) => x.type === 'condenser' && x.planet === planet)
      .slice(0, poweredCondensers);
    if (extractors.length === 0 && condensers.length === 0) return;

    const updated = new Map<number, Structure>();
    const newDrops: ResourceDrop[] = [];
    for (const [group, rate] of [
      [extractors, EXTRACT_RATE],
      [condensers, CONDENSE_RATE],
    ] as const) {
      for (const st of group) {
        const { structure, overflow } = advanceProducer(st, elapsedSec, rate);
        updated.set(st.id, structure);
        if (overflow > 0 && structure.resourceType) {
          newDrops.push({
            id: nextDropId++,
            planet,
            pos: structure.pos,
            type: structure.resourceType,
            amount: overflow,
          });
        }
      }
    }
    if (updated.size === 0) return;
    const structures = s.structures.map((x) => updated.get(x.id) ?? x);
    set({ structures, drops: newDrops.length ? [...s.drops, ...newDrops] : s.drops });
  },

  applyOfflineProduction: (planet, elapsedSec) => {
    const capped = Math.min(Math.max(0, elapsedSec), MAX_OFFLINE_SECONDS);
    if (capped <= 0) return;
    const s = get();
    const { poweredExtractors, poweredCondensers } = planetPower(s.structures, planet);
    if (poweredExtractors <= 0 && poweredCondensers <= 0) return;
    const extractors = s.structures
      .filter((x) => x.type === 'extractor' && x.planet === planet)
      .slice(0, poweredExtractors);
    const condensers = s.structures
      .filter((x) => x.type === 'condenser' && x.planet === planet)
      .slice(0, poweredCondensers);
    if (extractors.length === 0 && condensers.length === 0) return;

    // Offline catch-up never spills to the ground (there's no one there to
    // watch it happen) — excess production while away is simply capped by
    // whatever storage the producer already has, same as a full silo.
    const updated = new Map<number, Structure>();
    for (const [group, rate] of [
      [extractors, EXTRACT_RATE],
      [condensers, CONDENSE_RATE],
    ] as const) {
      for (const st of group) {
        updated.set(st.id, advanceProducer(st, capped, rate).structure);
      }
    }
    if (updated.size === 0) return;
    const structures = s.structures.map((x) => updated.get(x.id) ?? x);
    set({ structures });
  },
}));

/** Monotonic id source for ground drops + structures. */
let nextDropId = 1;
export function nextStructureId(): number {
  return nextDropId++;
}

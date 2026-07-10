import { beforeEach, describe, expect, it } from 'vitest';
import { useStore, nextStructureId, backpackUsed, MAX_OFFLINE_SECONDS, type Structure } from './store';
import { DEFAULT_UPGRADES } from './ship/upgrades';

// Pristine state captured before any test runs; actions never mutate state
// objects in place, so restoring these references resets the store exactly.
const initialState = useStore.getState();

beforeEach(() => {
  useStore.setState(initialState, true);
});

function seedStructure(partial: Omit<Structure, 'id'>): Structure {
  const s: Structure = { id: nextStructureId(), ...partial };
  useStore.getState().addStructure(s);
  return s;
}

describe('ship upgrades', () => {
  it('derives backpack capacity from the cargo tier on hydration (reload bug)', () => {
    useStore.getState().setShipUpgrades({ ...DEFAULT_UPGRADES, cargo: 2 });
    expect(useStore.getState().backpackCapacity).toBe(50 + 2 * 50);
    // Hydrating back to zero tiers restores the base capacity.
    useStore.getState().setShipUpgrades({ ...DEFAULT_UPGRADES });
    expect(useStore.getState().backpackCapacity).toBe(50);
  });

  it('buying a cargo tier deducts the cost and raises capacity', () => {
    useStore.getState().setInventory({ iron: 10, titanite: 8 });
    useStore.getState().setItems({ crate: 1 });
    expect(useStore.getState().upgradeShip('cargo')).toBe(true);
    const s = useStore.getState();
    expect(s.shipUpgrades.cargo).toBe(1);
    expect(s.backpackCapacity).toBe(100);
    expect(s.inventory.iron ?? 0).toBe(0);
    expect(s.items.crate ?? 0).toBe(0);
  });

  it('never partially spends when only one of the two cost kinds is affordable', () => {
    // Shielding T1 needs resources AND items; give resources but no items.
    useStore.getState().setInventory({ iron: 16, titanite: 14 });
    useStore.getState().setItems({});
    expect(useStore.getState().upgradeShip('shielding')).toBe(false);
    const s = useStore.getState();
    expect(s.shipUpgrades.shielding).toBe(0);
    expect(s.inventory.iron).toBe(16);
    expect(s.inventory.titanite).toBe(14);
  });
});

describe('mining and drops', () => {
  it('adds what fits and drops the overflow on the terrain', () => {
    useStore.getState().setInventory({});
    const overflow = useStore.getState().mineResource('carbon', 60, 'Mars', [1, 2, 3]);
    const s = useStore.getState();
    expect(overflow).toBe(10); // base capacity is 50
    expect(s.inventory.carbon).toBe(50);
    expect(s.drops).toHaveLength(1);
    expect(s.drops[0]).toMatchObject({ planet: 'Mars', type: 'carbon', amount: 10 });
    expect(s.seenResources.carbon).toBe(true);
  });

  it('setDropsForPlanet replaces only that body and keeps the id source ahead', () => {
    useStore.getState().setInventory({});
    useStore.getState().mineResource('iron', 60, 'Mars', [0, 0, 0]); // one Mars drop
    useStore
      .getState()
      .setDropsForPlanet('Titan', [
        { id: 9999, planet: 'Titan', pos: [1, 1, 1], type: 'carbon', amount: 3 },
      ]);
    const s = useStore.getState();
    expect(s.drops.filter((d) => d.planet === 'Mars')).toHaveLength(1);
    expect(s.drops.filter((d) => d.planet === 'Titan')).toHaveLength(1);
    expect(nextStructureId()).toBeGreaterThan(9999);
  });

  it('collectDrop takes only what fits in the backpack', () => {
    useStore.getState().setInventory({ carbon: 45 });
    useStore
      .getState()
      .setDropsForPlanet('Mars', [
        { id: nextStructureId(), planet: 'Mars', pos: [0, 0, 0], type: 'carbon', amount: 20 },
      ]);
    const drop = useStore.getState().drops[0];
    useStore.getState().collectDrop(drop.id);
    const s = useStore.getState();
    expect(s.inventory.carbon).toBe(50);
    expect(backpackUsed(s.inventory)).toBe(50);
    expect(s.drops[0].amount).toBe(15); // remainder stays on the ground
  });
});

describe('crafting', () => {
  it('consumes inputs from the backpack first, then nearby silos', () => {
    const station = seedStructure({
      planet: 'Mars',
      type: 'station',
      pos: [0, 0, 0],
      stored: {},
      capacity: 0,
    });
    seedStructure({
      planet: 'Mars',
      type: 'silo',
      pos: [3, 0, 0],
      stored: { iron: 2, silicon: 2 },
      capacity: 240,
    });
    useStore.getState().setInventory({ iron: 2 });

    // alloy = 4 iron + 2 silicon: 2 iron from the pack, 2 iron + 2 silicon from the silo.
    expect(useStore.getState().craft('alloy', station.id)).toBe(true);
    const s = useStore.getState();
    expect(s.items.alloy).toBe(1);
    expect(s.inventory.iron ?? 0).toBe(0);
    const silo = s.structures.find((x) => x.type === 'silo')!;
    expect(silo.stored.iron ?? 0).toBe(0);
    expect(silo.stored.silicon ?? 0).toBe(0);
  });

  it('fails without touching anything when inputs are short', () => {
    const station = seedStructure({
      planet: 'Mars',
      type: 'station',
      pos: [0, 0, 0],
      stored: {},
      capacity: 0,
    });
    useStore.getState().setInventory({ iron: 3 }); // alloy needs 4 iron + 2 silicon
    expect(useStore.getState().craft('alloy', station.id)).toBe(false);
    expect(useStore.getState().inventory.iron).toBe(3);
    expect(useStore.getState().items.alloy ?? 0).toBe(0);
  });

  it('ignores silos outside the pull radius', () => {
    const station = seedStructure({
      planet: 'Mars',
      type: 'station',
      pos: [0, 0, 0],
      stored: {},
      capacity: 0,
    });
    seedStructure({
      planet: 'Mars',
      type: 'silo',
      pos: [30, 0, 0], // pull radius is 12
      stored: { iron: 10, silicon: 10 },
      capacity: 240,
    });
    useStore.getState().setInventory({});
    expect(useStore.getState().craft('alloy', station.id)).toBe(false);
  });
});

describe('refineTick', () => {
  it('smelts 2 ore into 1 ingot when a refinery is powered', () => {
    // Jorden has an atmosphere, so one wind turbine (2 power) runs one refinery.
    seedStructure({ planet: 'Jorden', type: 'wind', pos: [0, 0, 0], stored: {}, capacity: 0 });
    const refinery = seedStructure({
      planet: 'Jorden',
      type: 'refinery',
      pos: [2, 0, 0],
      stored: {},
      capacity: 0,
    });
    seedStructure({
      planet: 'Jorden',
      type: 'silo',
      pos: [refinery.pos[0] + 2, 0, 0],
      stored: { iron: 2 },
      capacity: 240,
    });

    useStore.getState().refineTick('Jorden');
    const s = useStore.getState();
    expect(s.items.iron_ingot).toBe(1);
    const silo = s.structures.find((x) => x.type === 'silo')!;
    expect(silo.stored.iron ?? 0).toBe(0);
  });

  it('does nothing without power', () => {
    const refinery = seedStructure({
      planet: 'Mars',
      type: 'refinery',
      pos: [0, 0, 0],
      stored: {},
      capacity: 0,
    });
    seedStructure({
      planet: 'Mars',
      type: 'silo',
      pos: [refinery.pos[0] + 2, 0, 0],
      stored: { iron: 2 },
      capacity: 240,
    });
    useStore.getState().refineTick('Mars');
    expect(useStore.getState().items.iron_ingot ?? 0).toBe(0);
  });
});

describe('extractTick', () => {
  it('accumulates fractional progress and deposits whole units when powered', () => {
    // Jorden has an atmosphere, so one wind turbine (2 power) covers the
    // extractor's 1-power draw.
    seedStructure({ planet: 'Jorden', type: 'wind', pos: [0, 0, 0], stored: {}, capacity: 0 });
    const extractor = seedStructure({
      planet: 'Jorden',
      type: 'extractor',
      pos: [2, 0, 0],
      stored: {},
      capacity: 120,
      resourceType: 'iron',
    });

    // Rate is 1/6 unit/sec: 3s isn't enough for a whole unit yet.
    useStore.getState().extractTick('Jorden', 3);
    let s = useStore.getState().structures.find((x) => x.id === extractor.id)!;
    expect(s.stored.iron ?? 0).toBe(0);
    expect(s.progress).toBeCloseTo(0.5);

    // Another 3s crosses the 1-unit threshold.
    useStore.getState().extractTick('Jorden', 3);
    s = useStore.getState().structures.find((x) => x.id === extractor.id)!;
    expect(s.stored.iron).toBe(1);
    expect(s.progress).toBeCloseTo(0);
  });

  it('does nothing without power', () => {
    seedStructure({
      planet: 'Mars',
      type: 'extractor',
      pos: [0, 0, 0],
      stored: {},
      capacity: 120,
      resourceType: 'iron',
    });
    useStore.getState().extractTick('Mars', 60);
    const s = useStore.getState().structures[0];
    expect(s.stored.iron ?? 0).toBe(0);
    expect(s.progress ?? 0).toBe(0);
  });

  it('spills overflow to a ground drop once the extractor is full', () => {
    seedStructure({ planet: 'Jorden', type: 'wind', pos: [0, 0, 0], stored: {}, capacity: 0 });
    const extractor = seedStructure({
      planet: 'Jorden',
      type: 'extractor',
      pos: [2, 0, 0],
      stored: { iron: 1 },
      capacity: 1, // already full
      resourceType: 'iron',
    });
    useStore.getState().extractTick('Jorden', 6); // exactly 1 unit produced
    const s = useStore.getState();
    const st = s.structures.find((x) => x.id === extractor.id)!;
    expect(st.stored.iron).toBe(1); // unchanged — no room
    expect(s.drops).toHaveLength(1);
    expect(s.drops[0]).toMatchObject({ planet: 'Jorden', type: 'iron', amount: 1 });
  });

  it('gates condensers on whether the body has an atmosphere', () => {
    // Merkurius is airless: even with generation available, a condenser
    // there never draws power or produces.
    seedStructure({ planet: 'Merkurius', type: 'solar', pos: [0, 0, 0], stored: {}, capacity: 0 });
    const condenser = seedStructure({
      planet: 'Merkurius',
      type: 'condenser',
      pos: [2, 0, 0],
      stored: {},
      capacity: 100,
      resourceType: 'carbon',
    });
    useStore.getState().extractTick('Merkurius', 60);
    const s = useStore.getState().structures.find((x) => x.id === condenser.id)!;
    expect(s.stored.carbon ?? 0).toBe(0);
    expect(s.progress ?? 0).toBe(0);
  });
});

describe('applyOfflineProduction', () => {
  it('catches up production for the elapsed real-world time, capped at capacity, without spilling to the ground', () => {
    seedStructure({ planet: 'Jorden', type: 'wind', pos: [0, 0, 0], stored: {}, capacity: 0 });
    const extractor = seedStructure({
      planet: 'Jorden',
      type: 'extractor',
      pos: [2, 0, 0],
      stored: {},
      capacity: 5,
      resourceType: 'iron',
    });
    // 60s at 1/6 unit/sec = 10 units produced, but capacity is only 5.
    useStore.getState().applyOfflineProduction('Jorden', 60);
    const s = useStore.getState();
    const st = s.structures.find((x) => x.id === extractor.id)!;
    expect(st.stored.iron).toBe(5);
    expect(s.drops).toHaveLength(0); // capped silently, not dropped on the ground
  });

  it('clamps negative elapsed time (clock wound backward) to a no-op', () => {
    seedStructure({ planet: 'Jorden', type: 'wind', pos: [0, 0, 0], stored: {}, capacity: 0 });
    const extractor = seedStructure({
      planet: 'Jorden',
      type: 'extractor',
      pos: [2, 0, 0],
      stored: {},
      capacity: 120,
      resourceType: 'iron',
    });
    useStore.getState().applyOfflineProduction('Jorden', -1000);
    const s = useStore.getState().structures.find((x) => x.id === extractor.id)!;
    expect(s.stored.iron ?? 0).toBe(0);
  });

  it('caps the counted duration at MAX_OFFLINE_SECONDS', () => {
    seedStructure({ planet: 'Jorden', type: 'wind', pos: [0, 0, 0], stored: {}, capacity: 0 });
    const extractor = seedStructure({
      planet: 'Jorden',
      type: 'extractor',
      pos: [2, 0, 0],
      stored: {},
      capacity: 1_000_000,
      resourceType: 'iron',
    });
    useStore.getState().applyOfflineProduction('Jorden', MAX_OFFLINE_SECONDS * 10);
    const s = useStore.getState().structures.find((x) => x.id === extractor.id)!;
    expect(s.stored.iron).toBe(Math.floor(MAX_OFFLINE_SECONDS / 6));
  });
});

describe('space POI discovery (planet: "space")', () => {
  it('records a space discovery under a "space:" key without a new data shape', () => {
    const isNew = useStore.getState().recordDiscovery({ planet: 'space', id: 'derelict-hull-belt', name: 'Wreck' });
    expect(isNew).toBe(true);
    expect(useStore.getState().discovered['space:derelict-hull-belt']).toBe(true);
    expect(useStore.getState().journal[0].planet).toBe('space');
  });

  it('does not collide with a voxel-surface discovery of the same POI id on a different planet', () => {
    useStore.getState().recordDiscovery({ planet: 'space', id: 'poi-1', name: 'Space POI' });
    useStore.getState().recordDiscovery({ planet: 'Jorden', id: 'poi-1', name: 'Surface POI' });
    const s = useStore.getState();
    expect(s.discovered['space:poi-1']).toBe(true);
    expect(s.discovered['Jorden:poi-1']).toBe(true);
    expect(s.journal).toHaveLength(2);
  });

  it('returns false (no duplicate journal entry) on a repeat discovery', () => {
    useStore.getState().recordDiscovery({ planet: 'space', id: 'signal-belt', name: 'Signal' });
    const isNew = useStore.getState().recordDiscovery({ planet: 'space', id: 'signal-belt', name: 'Signal' });
    expect(isNew).toBe(false);
    expect(useStore.getState().journal).toHaveLength(1);
  });
});

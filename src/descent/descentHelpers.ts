import { Vector3 } from 'three';
import { PLANETS, findParentPlanet, type MoonData } from '../systems/bodies';
import { positionAtTime } from '../systems/ephemeris';

export interface DescentTarget {
  name: string;
  worldPos: Vector3;
  size: number;
  hasAtmosphere: boolean;
  atmosphereIntensity: number;
  atmosphereColor: number;
  isGasGiant: boolean;
}

const _pos = new Vector3();

export function resolveDescentTarget(name: string, simTimeDays: number): DescentTarget | null {
  const planet = PLANETS.find((p) => p.name === name);
  if (planet) {
    positionAtTime(planet.elements, planet.distance, simTimeDays, _pos);
    return {
      name: planet.name,
      worldPos: _pos.clone(),
      size: planet.size,
      hasAtmosphere: !!planet.atmosphere,
      atmosphereIntensity: planet.atmosphere?.intensity ?? 0,
      atmosphereColor: planet.atmosphere?.color ?? 0x000000,
      isGasGiant: planet.bodyType === 'gas',
    };
  }

  const parent = findParentPlanet(name);
  if (!parent) return null;
  const moon = parent.moons.find((m) => m.name === name) as MoonData;

  positionAtTime(parent.elements, parent.distance, simTimeDays, _pos);
  const angle = moon.initialAngle + (simTimeDays / moon.orbitalPeriodDays) * Math.PI * 2;
  _pos.x += Math.cos(angle) * moon.distance;
  _pos.z += Math.sin(angle) * moon.distance;

  return {
    name: moon.name,
    worldPos: _pos.clone(),
    size: moon.size,
    hasAtmosphere: !!moon.atmosphere,
    atmosphereIntensity: moon.atmosphere?.intensity ?? 0,
    atmosphereColor: moon.atmosphere?.color ?? 0x000000,
    isGasGiant: false,
  };
}

export function findNearestLandable(
  shipPos: Vector3,
  simTimeDays: number,
): { name: string; distance: number; size: number } | null {
  let best: { name: string; distance: number; size: number } | null = null;

  for (const p of PLANETS) {
    positionAtTime(p.elements, p.distance, simTimeDays, _pos);
    const dist = shipPos.distanceTo(_pos);
    if (!best || dist < best.distance) {
      best = { name: p.name, distance: dist, size: p.size };
    }
    for (const m of p.moons) {
      const angle = m.initialAngle + (simTimeDays / m.orbitalPeriodDays) * Math.PI * 2;
      const mx = _pos.x + Math.cos(angle) * m.distance;
      const mz = _pos.z + Math.sin(angle) * m.distance;
      const md = Math.sqrt(
        (shipPos.x - mx) ** 2 + shipPos.y ** 2 + (shipPos.z - mz) ** 2,
      );
      if (!best || md < best.distance) {
        best = { name: m.name, distance: md, size: m.size };
      }
    }
  }
  return best;
}

export const ORBIT_DURATION = 3.0;
export const ATMOSPHERE_DURATION = 4.0;
export const LANDING_DURATION = 3.0;
export const GAS_GIANT_ABORT_DELAY = 2.0;

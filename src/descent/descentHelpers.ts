import { Vector3 } from 'three';
import { PLANETS, findParentPlanet, moonLocalOffset, type MoonData } from '../systems/bodies';
import { positionAtTime } from '../systems/ephemeris';

/** Range (render units) within which a body can be landed on. Shared by the HUD
 *  Land button and the keyboard/gamepad land shortcuts so they always agree. */
export function landRange(bodySize: number): number {
  return bodySize * 3.5 + 15;
}

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
  // Same offset the renderer uses, so we descend onto the moon you actually see.
  const [ox, oy, oz] = moonLocalOffset(moon, simTimeDays);
  _pos.x += ox;
  _pos.y += oy;
  _pos.z += oz;

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
    // Only rank the planet itself if it's landable — otherwise a gas giant would
    // always shadow its (landable) moons and you could never descend to them.
    if (p.bodyType !== 'gas') {
      const dist = shipPos.distanceTo(_pos);
      if (!best || dist < best.distance) {
        best = { name: p.name, distance: dist, size: p.size };
      }
    }
    for (const m of p.moons) {
      // Same offset the renderer uses, so proximity matches the visible moon.
      const [ox, oy, oz] = moonLocalOffset(m, simTimeDays);
      const mx = _pos.x + ox;
      const my = _pos.y + oy;
      const mz = _pos.z + oz;
      const md = Math.sqrt(
        (shipPos.x - mx) ** 2 + (shipPos.y - my) ** 2 + (shipPos.z - mz) ** 2,
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

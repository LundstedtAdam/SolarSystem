import { Vector3 } from 'three/webgpu';

const DEG = Math.PI / 180;
const DAYS_PER_YEAR = 365.25;

/**
 * J2000 Keplerian orbital elements. Angles in degrees. `m0Deg` is the mean
 * anomaly at the J2000 epoch (derived from mean longitude L and longitude of
 * perihelion ϖ: M0 = L − ϖ, ω = ϖ − Ω).
 */
export interface OrbitalElements {
  aAU: number; // semi-major axis (AU) — used for the real orbital PERIOD
  e: number; // eccentricity
  iDeg: number; // inclination to the ecliptic
  omegaDeg: number; // Ω, longitude of ascending node
  wDeg: number; // ω, argument of perihelion
  m0Deg: number; // mean anomaly at J2000
}

/** Orbital period in days from the semi-major axis (Kepler's third law). */
export function periodDays(el: OrbitalElements): number {
  return DAYS_PER_YEAR * Math.pow(el.aAU, 1.5);
}

/** Solve Kepler's equation M = E − e·sinE for the eccentric anomaly E (radians). */
function solveKepler(M: number, e: number): number {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 8; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-7) break;
  }
  return E;
}

/**
 * Position of a body at time `tDays` (days since J2000), on an ellipse whose
 * semi-major axis is `aRender` (cinematic, compressed) but whose shape (e),
 * orientation (i, Ω, ω) and phase/period are real. Returns scene coordinates
 * with the ecliptic on the XZ-plane and +Y up.
 */
export function positionAtTime(
  el: OrbitalElements,
  aRender: number,
  tDays: number,
  out = new Vector3()
): Vector3 {
  const n = 360 / periodDays(el); // mean motion, deg/day
  const M = (el.m0Deg + n * tDays) * DEG;
  const E = solveKepler(M, el.e);

  // Perifocal coordinates, scaled to the render semi-major axis.
  const xp = aRender * (Math.cos(E) - el.e);
  const yp = aRender * Math.sqrt(1 - el.e * el.e) * Math.sin(E);

  const w = el.wDeg * DEG;
  const O = el.omegaDeg * DEG;
  const i = el.iDeg * DEG;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const cO = Math.cos(O);
  const sO = Math.sin(O);
  const ci = Math.cos(i);
  const si = Math.sin(i);

  // Rotate perifocal → heliocentric ecliptic (xe, ye, ze).
  const xe = (cO * cw - sO * sw * ci) * xp + (-cO * sw - sO * cw * ci) * yp;
  const ye = (sO * cw + cO * sw * ci) * xp + (-sO * sw + cO * cw * ci) * yp;
  const ze = si * sw * xp + si * cw * yp;

  // Map ecliptic → scene (ecliptic on XZ, +Y up).
  return out.set(xe, ze, ye);
}

/** Sample the full orbit ellipse as scene-space points (for the orbit line). */
export function orbitCurve(el: OrbitalElements, aRender: number, segments = 256): Vector3[] {
  const pts: Vector3[] = [];
  const w = el.wDeg * DEG;
  const O = el.omegaDeg * DEG;
  const i = el.iDeg * DEG;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const cO = Math.cos(O);
  const sO = Math.sin(O);
  const ci = Math.cos(i);
  const si = Math.sin(i);
  const b = Math.sqrt(1 - el.e * el.e);
  for (let s = 0; s <= segments; s++) {
    const E = (s / segments) * Math.PI * 2;
    const xp = aRender * (Math.cos(E) - el.e);
    const yp = aRender * b * Math.sin(E);
    const xe = (cO * cw - sO * sw * ci) * xp + (-cO * sw - sO * cw * ci) * yp;
    const ye = (sO * cw + cO * sw * ci) * xp + (-sO * sw + cO * cw * ci) * yp;
    const ze = si * sw * xp + si * cw * yp;
    pts.push(new Vector3(xe, ze, ye));
  }
  return pts;
}

const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);

/** Days between the J2000 epoch (2000-01-01 12:00 TT) and a given date. */
export function daysSinceJ2000(date: Date): number {
  return (date.getTime() - J2000_MS) / 86400000;
}

/** Calendar date for a given number of days since J2000. */
export function dateFromDays(days: number): Date {
  return new Date(J2000_MS + days * 86400000);
}

import { useStore } from './store';

export type Lang = 'en' | 'sv';

/** Canonical body id (the Swedish name used in data) → localized display names. */
const BODY_NAMES: Record<string, { en: string; sv: string }> = {
  Merkurius: { en: 'Mercury', sv: 'Merkurius' },
  Venus: { en: 'Venus', sv: 'Venus' },
  Jorden: { en: 'Earth', sv: 'Jorden' },
  Mars: { en: 'Mars', sv: 'Mars' },
  Jupiter: { en: 'Jupiter', sv: 'Jupiter' },
  Saturnus: { en: 'Saturn', sv: 'Saturnus' },
  Uranus: { en: 'Uranus', sv: 'Uranus' },
  Neptunus: { en: 'Neptune', sv: 'Neptunus' },
  Månen: { en: 'Moon', sv: 'Månen' },
  Phobos: { en: 'Phobos', sv: 'Phobos' },
  Deimos: { en: 'Deimos', sv: 'Deimos' },
  Io: { en: 'Io', sv: 'Io' },
  Europa: { en: 'Europa', sv: 'Europa' },
  Ganymede: { en: 'Ganymede', sv: 'Ganymede' },
  Callisto: { en: 'Callisto', sv: 'Callisto' },
  Titan: { en: 'Titan', sv: 'Titan' },
  Miranda: { en: 'Miranda', sv: 'Miranda' },
  Triton: { en: 'Triton', sv: 'Triton' },
};

export function bodyName(id: string, lang: Lang): string {
  return BODY_NAMES[id]?.[lang] ?? id;
}

const STRINGS = {
  en: {
    timeScale: 'Time scale',
    volume: 'Volume',
    pause: 'Pause',
    play: 'Play',
    tour: 'Tour',
    stop: 'Stop',
    orbits: 'Orbits',
    reset: 'Reset',
    mute: 'Mute',
    unmute: 'Unmute',
    labels: 'Labels',
    settings: 'Settings',
    language: 'Language',
    bodies: 'Bodies',
    date: 'Date',
    reducedMotion: 'Reduced motion',
    quality: 'Quality',
    flightControls: 'Flight controls',
    sensitivity: 'Sensitivity',
    deadzone: 'Dead zone',
    invertPitch: 'Invert pitch',
    flightAssist: 'Flight assist',
    close: 'Close',
    loading: 'Loading the solar system…',
    diameter: 'Diameter',
    distanceFromSun: 'Distance from the Sun',
    orbitalPeriod: 'Orbital period',
    eccentricity: 'Eccentricity',
    rotationPeriod: 'Rotation period',
    axialTilt: 'Axial tilt',
    retrograde: 'retrograde',
    years: 'yr',
    days: 'days',
    hours: 'hours',
    millionKm: 'million km',
  },
  sv: {
    timeScale: 'Tidsskala',
    volume: 'Volym',
    pause: 'Pausa',
    play: 'Spela',
    tour: 'Rundtur',
    stop: 'Stopp',
    orbits: 'Banor',
    reset: 'Återställ',
    mute: 'Tysta',
    unmute: 'Ljud på',
    labels: 'Etiketter',
    settings: 'Inställningar',
    language: 'Språk',
    bodies: 'Himlakroppar',
    date: 'Datum',
    reducedMotion: 'Reducerad rörelse',
    quality: 'Kvalitet',
    flightControls: 'Flygkontroller',
    sensitivity: 'Känslighet',
    deadzone: 'Dödzon',
    invertPitch: 'Invertera lutning',
    flightAssist: 'Flygassistans',
    close: 'Stäng',
    loading: 'Laddar solsystemet…',
    diameter: 'Diameter',
    distanceFromSun: 'Avstånd från solen',
    orbitalPeriod: 'Omloppstid',
    eccentricity: 'Excentricitet',
    rotationPeriod: 'Rotationstid',
    axialTilt: 'Axellutning',
    retrograde: 'retrograd',
    years: 'år',
    days: 'dygn',
    hours: 'timmar',
    millionKm: 'miljoner km',
  },
} as const;

export type StringKey = keyof (typeof STRINGS)['en'];

/** Translation helper bound to the current language. */
export function useT() {
  const lang = useStore((s) => s.language);
  return {
    lang,
    t: (key: StringKey) => STRINGS[lang][key],
    name: (id: string) => bodyName(id, lang),
  };
}

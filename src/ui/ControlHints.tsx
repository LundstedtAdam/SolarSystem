// First-time control hints. The flight and on-foot modes each get a one-shot
// overlay listing their bindings the first time the player enters them —
// nothing in the game surfaced E/Tab/B/C/F/V (or the flight keys) before this,
// so new players had no way to find the scan/build/craft loops. Dismissal is
// persisted per mode, so the overlay never nags a returning player.
//
// Hint copy lives here (not i18n.ts) because it's structured [key, action]
// rows per input style, not flat UI strings.

import { useState } from 'react';
import { useStore } from '../store';
import type { Lang } from '../i18n';
import { isTouchDevice } from '../voxel/voxelControls';

const SEEN_KEY = 'solarsystem.hints.v1';

type HintMode = 'flight' | 'voxel';

function loadSeen(): Partial<Record<HintMode, boolean>> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? '{}') as Partial<
      Record<HintMode, boolean>
    >;
  } catch {
    return {};
  }
}

function saveSeen(seen: Partial<Record<HintMode, boolean>>): void {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* storage unavailable — the overlay will just show again next session */
  }
}

/** [binding, action] rows per mode/input/language. */
const HINTS: Record<HintMode, Record<'desktop' | 'touch', Record<Lang, [string, string][]>>> = {
  flight: {
    desktop: {
      en: [
        ['W / S', 'Throttle forward / reverse'],
        ['Mouse (click to capture)', 'Steer — hold right button to orbit the camera'],
        ['A / D', 'Yaw left / right'],
        ['↑ / ↓', 'Pitch'],
        ['Q / E', 'Roll'],
        ['Mouse click / Space', 'Fire mining beam at asteroids'],
        ['Shift', 'Fine control (precise thrust + soft rotation)'],
        ['Land button', 'Appears near a body — descend to its surface'],
      ],
      sv: [
        ['W / S', 'Gas framåt / bakåt'],
        ['Mus (klicka för att fånga)', 'Styr — håll höger knapp för att snurra kameran'],
        ['A / D', 'Gir vänster / höger'],
        ['↑ / ↓', 'Lutning'],
        ['Q / E', 'Rollning'],
        ['Musklick / Mellanslag', 'Avfyra gruvstrålen mot asteroider'],
        ['Shift', 'Finkontroll (precis gas + mjuk rotation)'],
        ['Landa-knappen', 'Visas nära en kropp — gå ner till dess yta'],
      ],
    },
    touch: {
      en: [
        ['Left joystick', 'Steer the ship'],
        ['Right slider', 'Throttle'],
        ['↺ / ↻ buttons', 'Roll left / right'],
        ['FIRE button', 'Fire mining beam at asteroids'],
        ['Drag empty space', 'Orbit the camera'],
        ['Land button', 'Appears near a body — descend to its surface'],
      ],
      sv: [
        ['Vänster joystick', 'Styr skeppet'],
        ['Höger reglage', 'Gas'],
        ['↺ / ↻-knappar', 'Rulla vänster / höger'],
        ['FIRE-knappen', 'Avfyra gruvstrålen mot asteroider'],
        ['Dra på tom yta', 'Snurra kameran'],
        ['Landa-knappen', 'Visas nära en kropp — gå ner till dess yta'],
      ],
    },
  },
  voxel: {
    desktop: {
      en: [
        ['W A S D + Space', 'Move + jump (Shift to run)'],
        ['Click', 'Capture the cursor — then hold left button to mine'],
        ['Right button', 'Place the selected buildable'],
        ['E', 'Scan a nearby anomaly'],
        ['Tab / B', 'Backpack / build menu'],
        ['C / F / V', 'Craft at a station / deposit into / open a silo'],
        ['J', 'Knowledge journal'],
      ],
      sv: [
        ['W A S D + Mellanslag', 'Rör dig + hoppa (Shift för att springa)'],
        ['Klick', 'Fånga muspekaren — håll sedan vänster knapp för att gräva'],
        ['Höger knapp', 'Placera valt byggobjekt'],
        ['E', 'Skanna en anomali i närheten'],
        ['Tab / B', 'Ryggsäck / byggmeny'],
        ['C / F / V', 'Tillverka vid station / lämna i / öppna en silo'],
        ['J', 'Kunskapsdagboken'],
      ],
    },
    touch: {
      en: [
        ['Left joystick', 'Move'],
        ['Drag the view', 'Look around'],
        ['Dig / Place buttons', 'Mine and build'],
        ['Scan button', 'Lights up near an anomaly — record it'],
      ],
      sv: [
        ['Vänster joystick', 'Rör dig'],
        ['Dra i vyn', 'Se dig omkring'],
        ['Gräv/Placera-knapparna', 'Gräv och bygg'],
        ['Skanna-knappen', 'Tänds nära en anomali — registrera den'],
      ],
    },
  },
};

const TITLE: Record<HintMode, Record<Lang, string>> = {
  flight: { en: 'Flight controls', sv: 'Flygkontroller' },
  voxel: { en: 'On foot', sv: 'Till fots' },
};

const GOT_IT: Record<Lang, string> = { en: 'Got it', sv: 'Uppfattat' };

export function ControlHints() {
  const sceneMode = useStore((s) => s.sceneMode);
  const lang = useStore((s) => s.language);
  const [seen, setSeen] = useState<Partial<Record<HintMode, boolean>>>(loadSeen);

  const mode: HintMode | null =
    sceneMode.type === 'piloting' ? 'flight' : sceneMode.type === 'voxel' ? 'voxel' : null;
  if (!mode || seen[mode]) return null;

  const rows = HINTS[mode][isTouchDevice() ? 'touch' : 'desktop'][lang];
  const dismiss = () => {
    const next = { ...seen, [mode]: true as const };
    setSeen(next);
    saveSeen(next);
  };

  return (
    <div className="control-hints" role="dialog" aria-label={TITLE[mode][lang]}>
      <div className="control-hints-card">
        <h2>{TITLE[mode][lang]}</h2>
        <table>
          <tbody>
            {rows.map(([key, action]) => (
              <tr key={key}>
                <td className="control-hints-key">{key}</td>
                <td>{action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="button control-hints-dismiss" onClick={dismiss}>
          {GOT_IT[lang]}
        </button>
      </div>
    </div>
  );
}

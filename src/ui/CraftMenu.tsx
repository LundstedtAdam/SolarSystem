import { useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { revealedRecipes, recipeById, CRAFTED_LABEL } from '../voxel/recipes';
import { RESOURCE_LABEL } from '../voxel/resourceProfiles';
import type { ResourceType } from '../voxel/voxelTypes';

// Phase 11.2 — the crafting radial + blueprint. Opened when the player is at a
// station. The radial lists recipes the player has unlocked (by discovering the
// prerequisite material); picking one opens its blueprint, which shows the
// inputs satisfied from the backpack + nearby silos, and a Craft button.

function affordable(
  inputs: Partial<Record<ResourceType, number>>,
  avail: Partial<Record<ResourceType, number>>,
): boolean {
  return (Object.keys(inputs) as ResourceType[]).every((k) => (avail[k] ?? 0) >= (inputs[k] ?? 0));
}

export function CraftMenu({ stationId, onClose }: { stationId: number; onClose: () => void }) {
  const { t } = useT();
  const seen = useStore((s) => s.seenResources);
  // Subscribe to inventory + structures so availability re-renders after a craft.
  useStore((s) => s.inventory);
  useStore((s) => s.structures);
  const craft = useStore((s) => s.craft);
  const craftAvailability = useStore((s) => s.craftAvailability);
  const [selected, setSelected] = useState<string | null>(null);

  const recipes = revealedRecipes(seen);
  const avail = craftAvailability(stationId);

  // --- blueprint view ---
  const recipe = selected ? recipeById(selected) : null;
  if (recipe) {
    const canCraft = affordable(recipe.inputs, avail);
    return (
      <div className="voxel-sheet-backdrop" onClick={onClose}>
        <div className="voxel-sheet" onClick={(e) => e.stopPropagation()}>
          <div className="voxel-sheet-head">
            <span>{recipe.name}</span>
            <button className="voxel-sheet-close" onClick={() => setSelected(null)}>
              ◂ {t('close')}
            </button>
          </div>
          <div className="craft-blueprint">{CRAFTED_LABEL[recipe.output]}</div>
          <div className="voxel-sheet-list">
            {(Object.keys(recipe.inputs) as ResourceType[]).map((k) => {
              const need = recipe.inputs[k] ?? 0;
              const have = avail[k] ?? 0;
              return (
                <div key={k} className="voxel-pack-row">
                  <span className="voxel-pack-name">{RESOURCE_LABEL[k]}</span>
                  <span className={`voxel-pack-amount${have >= need ? '' : ' short'}`}>
                    {have}/{need}
                  </span>
                </div>
              );
            })}
          </div>
          <button
            className="craft-confirm"
            disabled={!canCraft}
            onClick={() => {
              if (craft(recipe.id, stationId)) onClose();
            }}
          >
            {t('craft')}
          </button>
        </div>
      </div>
    );
  }

  // --- radial view ---
  const n = recipes.length;
  const R = 96;
  return (
    <div className="voxel-sheet-backdrop" onClick={onClose}>
      <div className="craft-radial" onClick={(e) => e.stopPropagation()}>
        <div className="craft-radial-center">{t('craft')}</div>
        {n === 0 && <div className="craft-radial-empty">Mine new materials to unlock recipes.</div>}
        {recipes.map((r, i) => {
          const ang = (-90 + (i - (n - 1) / 2) * 42) * (Math.PI / 180);
          const x = Math.cos(ang) * R;
          const y = Math.sin(ang) * R;
          const ok = affordable(r.inputs, avail);
          return (
            <button
              key={r.id}
              className={`craft-seg${ok ? ' ok' : ''}`}
              style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
              onClick={() => setSelected(r.id)}
            >
              {r.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

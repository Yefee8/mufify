import { useEffect, useState } from 'react';

import {
  getActiveSavedPresetId,
  getSavedEqualizerPresets,
  setActiveSavedPresetId,
  setSavedEqualizerPresets,
} from '@/services/settings';

import { addSavedPreset, removeSavedPreset, type SavedPreset } from './savedPresets';

/**
 * The presets the user made, and which of them is currently loaded.
 *
 * A store rather than component state because two controls in the same section
 * read it and both can change it: the picker lists and selects, the Save button
 * adds. Held separately they drift — saving a preset would leave the picker
 * showing a list without it until something else re-rendered that half of the
 * screen.
 *
 * The **active id** is the other half, and it is new. Loading a saved preset
 * writes its curve into the custom levels, so as far as the engine is concerned
 * the selection is "custom" and always was. That is still true, and it left the
 * picker unable to say *which* preset you were listening to — it showed
 * "Custom" for a thing you had given a name. Remembering the id alongside costs
 * nothing and is cleared the moment the curve stops being that preset's: a
 * built-in chosen, or a band dragged.
 */

let presets = getSavedEqualizerPresets();
let activeId = getActiveSavedPresetId();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function getPresets(): SavedPreset[] {
  return presets;
}

export function getActiveId(): string | null {
  return activeId;
}

/** The loaded preset, or null for a built-in or a hand-dragged curve. */
export function getActivePreset(): SavedPreset | null {
  return presets.find((preset) => preset.id === activeId) ?? null;
}

export function savePreset(name: string, points: SavedPreset['points']): void {
  const next = addSavedPreset(presets, name, points);
  presets = next;
  setSavedEqualizerPresets(next);

  // Saving selects what was just saved: it is the curve already playing, and
  // showing "Custom" a moment after somebody named it would read as the name
  // not having taken.
  const saved = next.find((preset) => preset.name === name.trim());
  setActive(saved?.id ?? null);
  emit();
}

export function forgetPreset(id: string): void {
  presets = removeSavedPreset(presets, id);
  setSavedEqualizerPresets(presets);
  // The curve stays where it is — deleting the name does not change the sound —
  // but nothing is selected any more, because the thing selected is gone.
  if (activeId === id) setActive(null);
  emit();
}

/** Records which saved preset the current curve came from. Null for neither. */
export function setActive(id: string | null): void {
  if (id === activeId) return;
  activeId = id;
  setActiveSavedPresetId(id);
  emit();
}

/** The list and the selection, re-rendering whoever reads them on any change. */
export function useSavedPresets(): { presets: SavedPreset[]; activeId: string | null } {
  const [, bump] = useState(0);

  useEffect(() => {
    const listener = () => bump((count) => count + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return { presets, activeId };
}

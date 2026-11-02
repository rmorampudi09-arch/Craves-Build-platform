import React from 'react';
import {useAdvancedFeature} from '../../../core/advanced/advancedFeatures';
import {
  DishLabelsConflictError,
  taxonomyApi,
  type ChefDishLabels,
  type TaxonomyVocabulary,
} from '../../dishLabels/api/taxonomyApi';
import type {LabelSelection} from '../../dishLabels/domain/dishLabels';
import {forgetNearbyDishLabels} from '../../dishLabels/state/nearbyDishLabels';

export interface ChefDishLabelsModel {
  /** The taxonomy feature is on, the vocabulary loaded and the dish's current labels (if any) loaded. */
  enabled: boolean;
  vocabulary: TaxonomyVocabulary | null;
  selection: LabelSelection;
  setSelection: (next: LabelSelection) => void;
  changed: boolean;
  error: string | null;
  /** True when nothing changed or the save worked. */
  save: (menuItemId: string) => Promise<boolean>;
}

const NONE: LabelSelection = {cuisines: [], diets: []};
const CONFLICT = 'These labels changed somewhere else. We loaded the latest; check them and save again.';
const FAILED = "Labels didn't save. Try again.";

// Order counts: the first cuisine is the main one.
const sameCodes = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((code, index) => code === b[index]);

/** The cuisine and diet labels of one dish; `menuItemId` null for a dish that does not exist yet. */
export function useChefDishLabels(menuItemId: string | null): ChefDishLabelsModel {
  const on = useAdvancedFeature('taxonomy');
  const [vocabulary, setVocabulary] = React.useState<TaxonomyVocabulary | null>(null);
  // What the server holds. A new dish has nothing to load; an existing one stays null until loaded, so a failed load
  // keeps the section hidden and a save can never wipe labels that were not loaded.
  const [saved, setSaved] = React.useState<{labels: LabelSelection; version: number | null} | null>(
    menuItemId ? null : {labels: NONE, version: null},
  );
  const [selection, setSelection] = React.useState<LabelSelection>(NONE);
  const [error, setError] = React.useState<string | null>(null);

  const apply = React.useCallback((labels: ChefDishLabels) => {
    const next = {cuisines: labels.cuisines, diets: labels.diets};
    setSaved({labels: next, version: labels.version});
    setSelection(next);
  }, []);

  React.useEffect(() => {
    if (!on) {
      return undefined;
    }
    let live = true;
    taxonomyApi.vocabulary().then(
      loaded => live && setVocabulary(loaded),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [on]);

  React.useEffect(() => {
    if (!on || !menuItemId) {
      return undefined;
    }
    let live = true;
    taxonomyApi.chefLabels(menuItemId).then(
      labels => live && apply(labels),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [apply, menuItemId, on]);

  const enabled = on && vocabulary !== null && saved !== null;
  const changed =
    enabled &&
    (!sameCodes(selection.cuisines, saved.labels.cuisines) || !sameCodes(selection.diets, saved.labels.diets));

  const save = async (id: string): Promise<boolean> => {
    if (!changed) {
      return true;
    }
    setError(null);
    try {
      apply(await taxonomyApi.saveChefLabels(id, selection, saved.version));
      forgetNearbyDishLabels([id]);
      return true;
    } catch (cause) {
      if (!(cause instanceof DishLabelsConflictError)) {
        setError(FAILED);
        return false;
      }
      try {
        apply(await taxonomyApi.chefLabels(id));
        setError(CONFLICT);
      } catch {
        // The latest could not be loaded, so do not claim it was.
        setError(FAILED);
      }
      return false;
    }
  };

  return {enabled, vocabulary, selection, setSelection, changed, error, save};
}

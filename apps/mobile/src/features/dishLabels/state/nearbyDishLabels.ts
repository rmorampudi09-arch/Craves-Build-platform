import {useEffect, useState} from 'react';
import {
  isAdvancedFeatureOn,
  loadAdvancedFeatures,
} from '../../../core/advanced/advancedFeatures';
import {
  taxonomyApi,
  type DishLabelCodes,
  type TaxonomyVocabulary,
} from '../api/taxonomyApi';

export interface NearbyDishLabels {
  vocabulary: TaxonomyVocabulary;
  /** Only dishes that came back from the lookup, i.e. that carry labels. */
  byId: ReadonlyMap<string, DishLabelCodes>;
}

const LOOKUP_CHUNK = 100;
// A chef can relabel a dish at any time, so cached answers are asked again after this.
const LABEL_CACHE_TTL_MS = 10 * 60 * 1000;

// Every dish already looked up; dish null means "seen, no labels" so it is not asked again.
const looked = new Map<string, {dish: DishLabelCodes | null; at: number}>();
let vocabulary: TaxonomyVocabulary | null = null;
let snapshot: NearbyDishLabels | null = null;
let latestLoad = 0;

/**
 * Labels of the given dishes, or null when the taxonomy feature is off or any
 * call failed. Only the newest load writes the snapshot, so a slow older one
 * cannot overwrite it.
 */
export async function loadNearbyDishLabels(
  menuItemIds: readonly string[],
): Promise<NearbyDishLabels | null> {
  const mine = ++latestLoad;
  const finish = (result: NearbyDishLabels | null) => {
    if (mine === latestLoad) snapshot = result;
    return result;
  };
  // Wait for the feature list first: on a cold start the gate reads "off" until it has loaded.
  await loadAdvancedFeatures();
  if (!isAdvancedFeatureOn('taxonomy')) return finish(null);
  try {
    const now = Date.now();
    if (!vocabulary) vocabulary = await taxonomyApi.vocabulary();
    const unseen = [...new Set(menuItemIds)].filter(id => {
      const entry = looked.get(id);
      return !entry || now - entry.at > LABEL_CACHE_TTL_MS;
    });
    for (let i = 0; i < unseen.length; i += LOOKUP_CHUNK) {
      const chunk = unseen.slice(i, i + LOOKUP_CHUNK);
      const answered = new Map(
        (await taxonomyApi.lookup(chunk)).map(dish => [dish.menuItemId, dish]),
      );
      const at = Date.now();
      chunk.forEach(id => looked.set(id, {dish: answered.get(id) ?? null, at}));
    }
    const byId = new Map<string, DishLabelCodes>();
    for (const id of menuItemIds) {
      const dish = looked.get(id)?.dish;
      if (dish) byId.set(id, dish);
    }
    return finish({vocabulary, byId});
  } catch {
    return finish(null);
  }
}

/** Drops these dishes from the cache and snapshot so the next load asks for them again (e.g. after a chef saves labels). */
export function forgetNearbyDishLabels(menuItemIds: readonly string[]): void {
  menuItemIds.forEach(id => looked.delete(id));
  if (snapshot) {
    const byId = new Map(snapshot.byId);
    menuItemIds.forEach(id => byId.delete(id));
    snapshot = {vocabulary: snapshot.vocabulary, byId};
  }
}

/** What Filter & Sort reads: the labels of the dishes Home last loaded. */
export function getNearbyDishLabelsSnapshot(): NearbyDishLabels | null {
  return snapshot;
}

/** Reloads when the id list changes; `labels` keeps the last result while it reloads. */
export function useNearbyDishLabels(menuItemIds: readonly string[]): {
  labels: NearbyDishLabels | null;
  pending: boolean;
} {
  const key = menuItemIds.join(',');
  const [settled, setSettled] = useState<{
    key: string;
    labels: NearbyDishLabels | null;
  } | null>(null);
  useEffect(() => {
    let current = true;
    void loadNearbyDishLabels(key ? key.split(',') : []).then(labels => {
      if (current) setSettled({key, labels});
    });
    return () => {
      current = false;
    };
  }, [key]);
  return {labels: settled?.labels ?? null, pending: settled?.key !== key};
}

export function resetNearbyDishLabelsForTests(): void {
  latestLoad++;
  looked.clear();
  vocabulary = null;
  snapshot = null;
}

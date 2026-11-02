import type {
  DishLabelCodes,
  TaxonomyTerm,
  TaxonomyVocabulary,
} from '../api/taxonomyApi';

export interface LabelSelection {
  cuisines: string[];
  diets: string[];
}

const MAX_CUISINES = 3;
const MAX_DIETS = 6;

/** The code, then each parent up to the top. Stops on an unknown parent or a loop. */
export function cuisineLineage(code: string, vocabulary: TaxonomyVocabulary): string[] {
  const lineage = [code];
  let parent = vocabulary.cuisines.find(term => term.code === code)?.parentCode;
  while (parent && !lineage.includes(parent)) {
    const term = vocabulary.cuisines.find(candidate => candidate.code === parent);
    if (!term) break;
    lineage.push(parent);
    parent = term.parentCode;
  }
  return lineage;
}

export function dishMatchesLabels(
  dish: DishLabelCodes,
  selection: LabelSelection,
  vocabulary: TaxonomyVocabulary,
): boolean {
  const dishCuisines = new Set(dish.cuisines.flatMap(code => cuisineLineage(code, vocabulary)));
  const cuisineMatch =
    selection.cuisines.length === 0 || selection.cuisines.some(code => dishCuisines.has(code));
  return cuisineMatch && selection.diets.every(code => dish.diets.includes(code));
}

/** Terms to offer as filter chips: what dishes carry, plus the regions above them. */
export function termsOnDishes(
  dishes: readonly DishLabelCodes[],
  vocabulary: TaxonomyVocabulary,
): {cuisines: TaxonomyTerm[]; diets: TaxonomyTerm[]} {
  const cuisines = new Set(
    dishes.flatMap(dish => dish.cuisines.flatMap(code => cuisineLineage(code, vocabulary))),
  );
  const diets = new Set(dishes.flatMap(dish => dish.diets));
  return {
    cuisines: vocabulary.cuisines.filter(term => cuisines.has(term.code)),
    diets: vocabulary.diets.filter(term => diets.has(term.code)),
  };
}

function toggle(current: string[], code: string, limit: number): string[] {
  if (current.includes(code)) return current.filter(item => item !== code);
  return current.length < limit ? [...current, code] : current;
}

export const toggleCuisine = (current: string[], code: string): string[] =>
  toggle(current, code, MAX_CUISINES);

export const toggleDiet = (current: string[], code: string): string[] =>
  toggle(current, code, MAX_DIETS);

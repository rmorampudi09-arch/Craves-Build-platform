import type {
  DishLabelCodes,
  TaxonomyTerm,
  TaxonomyVocabulary,
} from '../api/taxonomyApi';
import {
  cuisineLineage,
  dishMatchesLabels,
  termsOnDishes,
  toggleCuisine,
  toggleDiet,
} from './dishLabels';

const cuisine = (code: string, parentCode: string | null): TaxonomyTerm => ({
  code,
  kind: 'CUISINE',
  parentCode,
  name: code,
});
const diet = (code: string): TaxonomyTerm => ({code, kind: 'DIET', parentCode: null, name: code});

const vocabulary: TaxonomyVocabulary = {
  cuisines: [
    cuisine('south-indian', null),
    cuisine('karnataka', 'south-indian'),
    cuisine('udupi', 'karnataka'),
    cuisine('andhra', 'south-indian'),
    cuisine('north-indian', null),
  ],
  diets: [diet('jain'), diet('vegan')],
};

const dish = (cuisines: string[], diets: string[] = []): DishLabelCodes => ({
  menuItemId: '00000000-0000-4000-8000-000000000001',
  cuisines,
  diets,
});

describe('dish label matching rules', () => {
  it('a region matches dishes from cuisines under it', () => {
    expect(
      dishMatchesLabels(dish(['udupi']), {cuisines: ['south-indian'], diets: []}, vocabulary),
    ).toBe(true);
  });

  it('cuisines are any-of', () => {
    expect(
      dishMatchesLabels(
        dish(['andhra']),
        {cuisines: ['north-indian', 'andhra'], diets: []},
        vocabulary,
      ),
    ).toBe(true);
  });

  it('diets are all-of', () => {
    expect(
      dishMatchesLabels(dish([], ['jain']), {cuisines: [], diets: ['jain', 'vegan']}, vocabulary),
    ).toBe(false);
  });

  it('an unknown code still matches itself', () => {
    expect(
      dishMatchesLabels(dish(['new-code']), {cuisines: ['new-code'], diets: []}, vocabulary),
    ).toBe(true);
  });

  it('terms on dishes include ancestors and skip unknown codes', () => {
    const terms = termsOnDishes([dish(['udupi', 'new-code'], ['jain'])], vocabulary);
    expect(terms.cuisines.map(t => t.code)).toEqual(['south-indian', 'karnataka', 'udupi']);
    expect(terms.diets.map(t => t.code)).toEqual(['jain']);
  });

  it('no labelled dishes gives no terms', () => {
    expect(termsOnDishes([], vocabulary)).toEqual({cuisines: [], diets: []});
  });

  it('a fourth cuisine is not added', () => {
    expect(toggleCuisine(['a', 'b', 'c'], 'd')).toEqual(['a', 'b', 'c']);
    expect(toggleCuisine(['a', 'b'], 'a')).toEqual(['b']);
    expect(toggleCuisine(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
  });

  it('a seventh diet is not added', () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(toggleDiet(six, 'g')).toEqual(six);
    expect(toggleDiet(six, 'f')).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('lineage stops on a loop', () => {
    const loop: TaxonomyVocabulary = {
      cuisines: [cuisine('x', 'y'), cuisine('y', 'x')],
      diets: [],
    };
    expect(cuisineLineage('x', loop)).toEqual(['x', 'y']);
  });
});

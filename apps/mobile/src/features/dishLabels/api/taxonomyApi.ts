import {apiClient} from '../../../core/http/apiClient';
import {toAppApiError} from '../../../core/http/apiError';
import {publicApiClient} from '../../../core/http/transport';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Same pattern the server enforces on every term code (TagRequest, NewTerm).
const CODE_PATTERN = /^[a-z][a-z0-9-]{1,39}$/;
const LOOKUP_MAX_IDS = 100;
const BASE = '/api/v1/advanced/taxonomy';

export interface TaxonomyTerm {
  code: string;
  kind: 'CUISINE' | 'DIET';
  parentCode: string | null;
  name: string;
}

export interface TaxonomyVocabulary {
  cuisines: TaxonomyTerm[];
  diets: TaxonomyTerm[];
}

export interface DishLabelCodes {
  menuItemId: string;
  cuisines: string[];
  diets: string[];
}

export interface ChefDishLabels extends DishLabelCodes {
  /** Null when the chef has not labelled this dish yet. */
  version: number | null;
}

/** The labels changed on the server since the chef loaded them (409 or 412). */
export class DishLabelsConflictError extends Error {
  constructor() {
    super('DISH_LABELS_CONFLICT');
    this.name = 'DishLabelsConflictError';
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function code(value: unknown): string | null {
  return typeof value === 'string' && CODE_PATTERN.test(value) ? value : null;
}

function parseTerm(value: unknown, kind: TaxonomyTerm['kind']): TaxonomyTerm | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const termCode = code(raw.code);
  const parentCode = raw.parentCode == null ? null : code(raw.parentCode);
  if (
    !termCode ||
    raw.kind !== kind ||
    (raw.parentCode != null && !parentCode) ||
    typeof raw.name !== 'string' ||
    !raw.name
  ) {
    return null;
  }
  return {code: termCode, kind, parentCode, name: raw.name};
}

function parseTerms(value: unknown, kind: TaxonomyTerm['kind']): TaxonomyTerm[] | null {
  if (!Array.isArray(value)) return null;
  const terms = value.map(item => parseTerm(item, kind));
  return terms.every(term => term !== null) ? (terms as TaxonomyTerm[]) : null;
}

function parseCodes(value: unknown, refs: boolean): string[] | null {
  if (!Array.isArray(value)) return null;
  const codes = value.map(item => code(refs ? asRecord(item)?.code : item));
  return codes.every(c => c !== null) ? (codes as string[]) : null;
}

function parseVocabulary(value: unknown): TaxonomyVocabulary | null {
  const raw = asRecord(value);
  const cuisines = raw && parseTerms(raw.cuisines, 'CUISINE');
  const diets = raw && parseTerms(raw.diets, 'DIET');
  return cuisines && diets ? {cuisines, diets} : null;
}

// DishTags carries {code, name} refs; ChefTagsView carries plain code strings.
function parseLabels(value: unknown, refs: boolean): DishLabelCodes | null {
  const raw = asRecord(value);
  if (!raw || typeof raw.menuItemId !== 'string' || !UUID_PATTERN.test(raw.menuItemId)) {
    return null;
  }
  const cuisines = parseCodes(raw.cuisines, refs);
  const diets = parseCodes(raw.diets, refs);
  return cuisines && diets ? {menuItemId: raw.menuItemId, cuisines, diets} : null;
}

function parseChefLabels(value: unknown, menuItemId: string): ChefDishLabels | null {
  const labels = parseLabels(value, false);
  const version = asRecord(value)?.version;
  return labels &&
    labels.menuItemId === menuItemId &&
    typeof version === 'number' &&
    Number.isSafeInteger(version) &&
    version >= 0
    ? {...labels, version}
    : null;
}

const emptyLabels = (menuItemId: string): ChefDishLabels => ({
  menuItemId,
  cuisines: [],
  diets: [],
  version: null,
});

const chefRoute = (menuItemId: string) =>
  `${BASE}/chef/menu-items/${encodeURIComponent(menuItemId)}`;

export const taxonomyApi = {
  async vocabulary(signal?: AbortSignal): Promise<TaxonomyVocabulary> {
    const response = await publicApiClient.get<unknown>(`${BASE}/vocabulary`, {signal});
    const parsed = parseVocabulary(response.data);
    if (!parsed) throw new Error('TAXONOMY_VOCABULARY_INVALID_RESPONSE');
    return parsed;
  },

  async lookup(menuItemIds: string[], signal?: AbortSignal): Promise<DishLabelCodes[]> {
    if (menuItemIds.length > LOOKUP_MAX_IDS) {
      throw new Error('TAXONOMY_LOOKUP_TOO_MANY');
    }
    const response = await publicApiClient.post<unknown>(
      `${BASE}/menu-items/lookup`,
      {menuItemIds},
      {signal},
    );
    const parsed = Array.isArray(response.data)
      ? response.data.map(item => parseLabels(item, true))
      : null;
    if (!parsed || parsed.some(item => item === null)) {
      throw new Error('TAXONOMY_LOOKUP_INVALID_RESPONSE');
    }
    return parsed as DishLabelCodes[];
  },

  async chefLabels(menuItemId: string): Promise<ChefDishLabels> {
    let data: unknown;
    try {
      data = (await apiClient.get<unknown>(chefRoute(menuItemId))).data;
    } catch (error) {
      // No labels saved yet.
      if (toAppApiError(error).status === 404) return emptyLabels(menuItemId);
      throw error;
    }
    const parsed = parseChefLabels(data, menuItemId);
    if (!parsed) throw new Error('TAXONOMY_CHEF_LABELS_INVALID_RESPONSE');
    return parsed;
  },

  async saveChefLabels(
    menuItemId: string,
    labels: {cuisines: string[]; diets: string[]},
    version: number | null,
  ): Promise<ChefDishLabels> {
    const route = chefRoute(menuItemId);
    const clearing = labels.cuisines.length === 0 && labels.diets.length === 0;
    let data: unknown;
    try {
      if (clearing) {
        await apiClient.delete(route);
        return emptyLabels(menuItemId);
      }
      data = (
        await apiClient.put<unknown>(
          route,
          {cuisines: labels.cuisines, diets: labels.diets},
          {headers: version === null ? {} : {'If-Match': `"${version}"`}},
        )
      ).data;
    } catch (error) {
      const status = toAppApiError(error).status;
      if (status === 409 || status === 412) throw new DishLabelsConflictError();
      throw error;
    }
    const parsed = parseChefLabels(data, menuItemId);
    if (!parsed) throw new Error('TAXONOMY_CHEF_LABELS_INVALID_RESPONSE');
    return parsed;
  },
};

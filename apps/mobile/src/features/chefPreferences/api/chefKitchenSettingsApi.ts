import {httpClient} from '../../../core/http/httpClient';

// Manifest marker for the APIM coverage check; screens fall back to Coming soon at runtime.
export const CHEF_KITCHEN_SETTINGS_AVAILABLE = false;

const ROUTE = '/api/v1/kitchens/me/settings';

export const MIN_PREP_MINUTES = 5;
export const MAX_PREP_MINUTES = 120;

export interface ChefKitchenSettings {
  autoAcceptOrders: boolean;
  /** Cooking time used when a dish has none; null until the chef sets one. */
  defaultPrepMinutes: number | null;
}

function parseSettings(value: unknown): ChefKitchenSettings {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  const minutes = raw?.defaultPrepMinutes;
  if (!raw || typeof raw.autoAcceptOrders !== 'boolean' || (minutes != null && typeof minutes !== 'number')) {
    throw new Error('CHEF_KITCHEN_SETTINGS_INVALID_RESPONSE');
  }
  return {autoAcceptOrders: raw.autoAcceptOrders, defaultPrepMinutes: minutes ?? null};
}

export const chefKitchenSettingsApi = {
  async get(signal?: AbortSignal): Promise<ChefKitchenSettings> {
    return parseSettings(await httpClient.get<unknown>(ROUTE, {signal, dedupeKey: 'chef-kitchen-settings'}));
  },

  /** PUT replaces both settings, so the caller always sends the pair. */
  async update(settings: ChefKitchenSettings, signal?: AbortSignal): Promise<ChefKitchenSettings> {
    const minutes = settings.defaultPrepMinutes;
    if (minutes != null && (!Number.isInteger(minutes) || minutes < MIN_PREP_MINUTES || minutes > MAX_PREP_MINUTES)) {
      throw new Error('CHEF_KITCHEN_SETTINGS_PREP_MINUTES_INVALID');
    }
    return parseSettings(await httpClient.put<unknown>(ROUTE, settings, {signal}));
  },
};

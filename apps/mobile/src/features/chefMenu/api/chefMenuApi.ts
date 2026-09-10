import {httpClient} from '../../../core/http/httpClient';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const CHEF_MENU_ITEM_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE'] as const;
export const CHEF_MENU_FOOD_TYPES = ['VEG', 'NON_VEG', 'EGG'] as const;
export const CHEF_MENU_SPICE_LEVELS = ['MILD', 'MEDIUM', 'SPICY'] as const;
export const CHEF_MENU_IMAGE_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export const CHEF_MENU_IMAGE_FILE_FIELD = 'file' as const;

/** Exact service defaults applied when optional MenuItemRequest values are absent/blank. */
export const CHEF_MENU_SERVER_DEFAULTS = {
  currency: 'INR',
  available: false,
  status: 'DRAFT',
} as const;

export interface ChefMenuContractGap {
  availability: 'unavailable';
  code: 'BACKEND_CONTRACT_UNAVAILABLE';
  reason: string;
}

function unavailable(reason: string): ChefMenuContractGap {
  return {
    availability: 'unavailable',
    code: 'BACKEND_CONTRACT_UNAVAILABLE',
    reason,
  };
}

/** Guide-required capabilities that have no approved exact backend/APIM contract today. */
export const CHEF_MENU_CONTRACT_GAPS = {
  itemDetail: unavailable('No chef-owned menu-item detail GET route is exposed.'),
  listQuery: unavailable(
    'The chef-owned list route exposes no search, filter, category, page, cursor, or summary parameters.',
  ),
  categoryMetadata: unavailable(
    'No chef menu category/subcategory metadata route is exposed.',
  ),
  visibility: unavailable(
    'No separate visibility contract exists; backend state is status plus available only.',
  ),
  deleteOrDuplicate: unavailable(
    'No delete or duplicate menu-item mutation is exposed.',
  ),
  draftRules: unavailable(
    'No separate draft-save or draft-validation contract exists beyond MenuItemRequest status=DRAFT.',
  ),
  duplicateNameCheck: unavailable(
    'No menu item duplicate/name-check route is exposed.',
  ),
  mediaManagement: unavailable(
    'Upload is exposed, but media delete, reorder, and set-primary-after-upload routes are not exposed.',
  ),
  mediaPolicy: unavailable(
    'Allowed upload content types are known, but the maximum file size is runtime-configured and no client-readable image-count/size policy contract is exposed.',
  ),
  catalogPublication: unavailable(
    'No separate catalog publication/synchronization acknowledgement contract is exposed.',
  ),
} as const satisfies Record<string, ChefMenuContractGap>;

export type ChefMenuItemStatus = (typeof CHEF_MENU_ITEM_STATUSES)[number];
export type ChefMenuFoodType = (typeof CHEF_MENU_FOOD_TYPES)[number];
export type ChefMenuSpiceLevel = (typeof CHEF_MENU_SPICE_LEVELS)[number];
export type ChefMenuImageContentType =
  (typeof CHEF_MENU_IMAGE_CONTENT_TYPES)[number];

export interface ChefMenuItemImage {
  id: string;
  menuItemId: string;
  blobContainer: string;
  blobName: string;
  contentType: ChefMenuImageContentType;
  fileSizeBytes: number;
  publicUrl: string | null;
  sortOrder: number;
  primary: boolean;
  createdAt: string;
}

export interface ChefMenuItem {
  id: string;
  kitchenId: string;
  itemName: string;
  description: string | null;
  category: string;
  foodType: ChefMenuFoodType;
  price: number;
  currency: string;
  servesCount: number | null;
  preparationTimeMinutes: number | null;
  spiceLevel: ChefMenuSpiceLevel | null;
  unitPackageWeightGrams: number;
  thermoboxRequired: boolean;
  available: boolean;
  status: ChefMenuItemStatus;
  images: ChefMenuItemImage[];
  createdAt: string;
  updatedAt: string;
}

/** Exact JSON body accepted by the backend MenuItemRequest record. */
export interface ChefMenuItemRequest {
  itemName: string;
  description?: string | null;
  category: string;
  foodType: ChefMenuFoodType;
  price: number;
  currency?: string | null;
  servesCount?: number | null;
  preparationTimeMinutes?: number | null;
  spiceLevel?: ChefMenuSpiceLevel | null;
  unitPackageWeightGrams: number;
  thermoboxRequired: boolean;
  available?: boolean | null;
  status?: ChefMenuItemStatus | null;
}

export interface ChefMenuAvailabilityRequest {
  available: boolean;
  reason?: string | null;
}

const STATUS_SET = new Set<string>(CHEF_MENU_ITEM_STATUSES);
const FOOD_TYPE_SET = new Set<string>(CHEF_MENU_FOOD_TYPES);
const SPICE_LEVEL_SET = new Set<string>(CHEF_MENU_SPICE_LEVELS);
const IMAGE_CONTENT_TYPE_SET = new Set<string>(CHEF_MENU_IMAGE_CONTENT_TYPES);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requiredString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function optionalString(value: unknown): string | null {
  return value == null || value === '' ? null : requiredString(value);
}

function uuid(value: unknown): string | null {
  const parsed = requiredString(value);
  return parsed && UUID_PATTERN.test(parsed) ? parsed : null;
}

function instant(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

function price(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0.01
    ? value
    : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function optionalPositiveInteger(value: unknown): number | null {
  return value == null ? null : positiveInteger(value);
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function exactBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function parseEnum<T extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
): T | null {
  const parsed = requiredString(value);
  return parsed && allowed.has(parsed) ? (parsed as T) : null;
}

export function isChefMenuItemId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function parseChefMenuItemImage(value: unknown): ChefMenuItemImage | null {
  const raw = asRecord(value);
  if (!raw) {
    return null;
  }

  const id = uuid(raw.id);
  const menuItemId = uuid(raw.menuItemId);
  const blobContainer = requiredString(raw.blobContainer);
  const blobName = requiredString(raw.blobName);
  const contentType = parseEnum<ChefMenuImageContentType>(
    raw.contentType,
    IMAGE_CONTENT_TYPE_SET,
  );
  const fileSizeBytes = positiveInteger(raw.fileSizeBytes);
  const sortOrder = nonNegativeInteger(raw.sortOrder);
  const primary = exactBoolean(raw.primary);
  const createdAt = instant(raw.createdAt);

  if (
    !id ||
    !menuItemId ||
    !blobContainer ||
    !blobName ||
    !contentType ||
    fileSizeBytes === null ||
    sortOrder === null ||
    primary === null ||
    !createdAt
  ) {
    return null;
  }

  return {
    id,
    menuItemId,
    blobContainer,
    blobName,
    contentType,
    fileSizeBytes,
    publicUrl: optionalString(raw.publicUrl),
    sortOrder,
    primary,
    createdAt,
  };
}

export function parseChefMenuItem(value: unknown): ChefMenuItem | null {
  const raw = asRecord(value);
  if (!raw) {
    return null;
  }

  const id = uuid(raw.id);
  const kitchenId = uuid(raw.kitchenId);
  const itemName = requiredString(raw.itemName);
  const category = requiredString(raw.category);
  const foodType = parseEnum<ChefMenuFoodType>(raw.foodType, FOOD_TYPE_SET);
  const itemPrice = price(raw.price);
  const currency = requiredString(raw.currency);
  const servesCount = optionalPositiveInteger(raw.servesCount);
  const preparationTimeMinutes = optionalPositiveInteger(
    raw.preparationTimeMinutes,
  );
  const spiceLevel =
    raw.spiceLevel == null
      ? null
      : parseEnum<ChefMenuSpiceLevel>(raw.spiceLevel, SPICE_LEVEL_SET);
  const unitPackageWeightGrams = positiveInteger(raw.unitPackageWeightGrams);
  const thermoboxRequired = exactBoolean(raw.thermoboxRequired);
  const available = exactBoolean(raw.available);
  const status = parseEnum<ChefMenuItemStatus>(raw.status, STATUS_SET);
  const createdAt = instant(raw.createdAt);
  const updatedAt = instant(raw.updatedAt);
  const images = Array.isArray(raw.images)
    ? raw.images.map(parseChefMenuItemImage)
    : null;

  if (
    !id ||
    !kitchenId ||
    !itemName ||
    !category ||
    !foodType ||
    itemPrice === null ||
    !currency ||
    (raw.servesCount != null && servesCount === null) ||
    (raw.preparationTimeMinutes != null && preparationTimeMinutes === null) ||
    (raw.spiceLevel != null && spiceLevel === null) ||
    unitPackageWeightGrams === null ||
    thermoboxRequired === null ||
    available === null ||
    !status ||
    !createdAt ||
    !updatedAt ||
    !images ||
    images.some(image => image === null || image.menuItemId !== id)
  ) {
    return null;
  }

  return {
    id,
    kitchenId,
    itemName,
    description: optionalString(raw.description),
    category,
    foodType,
    price: itemPrice,
    currency: currency.toUpperCase(),
    servesCount,
    preparationTimeMinutes,
    spiceLevel,
    unitPackageWeightGrams,
    thermoboxRequired,
    available,
    status,
    images: images as ChefMenuItemImage[],
    createdAt,
    updatedAt,
  };
}

export function parseChefMenuItems(value: unknown): ChefMenuItem[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const parsed = value.map(parseChefMenuItem);
  return parsed.some(item => item === null)
    ? null
    : (parsed as ChefMenuItem[]);
}

export function validateChefMenuItemRequest(
  request: ChefMenuItemRequest,
): ChefMenuItemRequest {
  if (!requiredString(request.itemName)) {
    throw new Error('Menu item name is required.');
  }
  if (!requiredString(request.category)) {
    throw new Error('Menu item category is required.');
  }
  if (!FOOD_TYPE_SET.has(request.foodType)) {
    throw new Error('Menu item food type is unsupported.');
  }
  if (price(request.price) === null) {
    throw new Error('Menu item price must be at least 0.01.');
  }
  if (positiveInteger(request.unitPackageWeightGrams) === null) {
    throw new Error('Package weight must be a positive integer.');
  }
  if (typeof request.thermoboxRequired !== 'boolean') {
    throw new Error('Thermobox requirement must be explicit.');
  }
  if (
    request.servesCount != null &&
    positiveInteger(request.servesCount) === null
  ) {
    throw new Error('Serves count must be a positive integer when supplied.');
  }
  if (
    request.preparationTimeMinutes != null &&
    positiveInteger(request.preparationTimeMinutes) === null
  ) {
    throw new Error(
      'Preparation time must be a positive integer when supplied.',
    );
  }
  if (
    request.spiceLevel != null &&
    !SPICE_LEVEL_SET.has(request.spiceLevel)
  ) {
    throw new Error('Menu item spice level is unsupported.');
  }
  if (request.status != null && !STATUS_SET.has(request.status)) {
    throw new Error('Menu item status is unsupported.');
  }
  if (request.available != null && typeof request.available !== 'boolean') {
    throw new Error('Menu item availability must be boolean when supplied.');
  }
  return request;
}

function requireMenuItemId(menuItemId: string): string {
  if (!isChefMenuItemId(menuItemId)) {
    throw new Error('Chef menu item ID must be a UUID.');
  }
  return menuItemId;
}

function requireItemResponse(value: unknown): ChefMenuItem {
  const parsed = parseChefMenuItem(value);
  if (!parsed) {
    throw new Error('Chef menu returned an unsupported item response.');
  }
  return parsed;
}

function requireImageResponse(value: unknown): ChefMenuItemImage {
  const parsed = parseChefMenuItemImage(value);
  if (!parsed) {
    throw new Error('Chef menu returned an unsupported image response.');
  }
  return parsed;
}

export const chefMenuApi = {
  async listItems(signal?: AbortSignal): Promise<ChefMenuItem[]> {
    const response = await httpClient.get<unknown>(
      '/api/v1/kitchens/me/menu-items',
      {signal, dedupeKey: 'chef-menu-items'},
    );
    const parsed = parseChefMenuItems(response);
    if (!parsed) {
      throw new Error('Chef menu returned an unsupported list response.');
    }
    return parsed;
  },

  async createItem(
    request: ChefMenuItemRequest,
    signal?: AbortSignal,
  ): Promise<ChefMenuItem> {
    const response = await httpClient.post<unknown>(
      '/api/v1/kitchens/me/menu-items',
      validateChefMenuItemRequest(request),
      {signal},
    );
    return requireItemResponse(response);
  },

  async replaceItem(
    menuItemId: string,
    request: ChefMenuItemRequest,
    signal?: AbortSignal,
  ): Promise<ChefMenuItem> {
    const id = requireMenuItemId(menuItemId);
    const response = await httpClient.put<unknown>(
      `/api/v1/kitchens/me/menu-items/${encodeURIComponent(id)}`,
      validateChefMenuItemRequest(request),
      {signal},
    );
    return requireItemResponse(response);
  },

  async updateAvailability(
    menuItemId: string,
    request: ChefMenuAvailabilityRequest,
    signal?: AbortSignal,
  ): Promise<ChefMenuItem> {
    const id = requireMenuItemId(menuItemId);
    if (typeof request.available !== 'boolean') {
      throw new Error('Menu item availability must be boolean.');
    }
    const response = await httpClient.patch<unknown>(
      `/api/v1/kitchens/me/menu-items/${encodeURIComponent(id)}/availability`,
      request,
      {signal},
    );
    return requireItemResponse(response);
  },

  async uploadImage(
    menuItemId: string,
    formData: FormData,
    primary = false,
    signal?: AbortSignal,
  ): Promise<ChefMenuItemImage> {
    const id = requireMenuItemId(menuItemId);
    const response = await httpClient.post<unknown>(
      `/api/v1/kitchens/me/menu-items/${encodeURIComponent(id)}/images?primary=${
        primary ? 'true' : 'false'
      }`,
      formData,
      {signal},
    );
    return requireImageResponse(response);
  },
};

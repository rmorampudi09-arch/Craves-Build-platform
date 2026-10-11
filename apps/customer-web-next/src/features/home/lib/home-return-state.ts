export type HomeDishSort =
  | "recommended"
  | "price-low-high"
  | "price-high-low"
  | "quickest";

/** Narrowing filters on Home's dish list; "any" means off. */
export type HomeDishFilters = {
  price: "any" | "under-150" | "150-300" | "over-300";
  ready: "any" | "30" | "45";
  distance: "any" | "3" | "5";
};

export const DEFAULT_DISH_FILTERS: HomeDishFilters = { price: "any", ready: "any", distance: "any" };

export type HomeFoodPreference = "all" | "veg" | "non-veg" | "egg";

export type HomeReturnState = {
  scrollY: number;
  searchTerm: string;
  searchOpen: boolean;
  homeCategory: string | null;
  dishSort: HomeDishSort;
  foodPreference: HomeFoodPreference;
  dishFilters: HomeDishFilters;
  savedAt: number;
};

const HOME_RETURN_STATE_KEY = "craves:customer-home-return-state";
const HOME_RETURN_STATE_TTL_MS = 30 * 60 * 1000;
const HOME_DISH_SORTS = new Set<HomeDishSort>([
  "recommended",
  "price-low-high",
  "price-high-low",
  "quickest",
]);
const FILTER_VALUES: { [Key in keyof HomeDishFilters]: readonly HomeDishFilters[Key][] } = {
  price: ["any", "under-150", "150-300", "over-300"],
  ready: ["any", "30", "45"],
  distance: ["any", "3", "5"],
};

/** Anything unknown (an older saved state, a hand-edited one) falls back to "any". */
function parseDishFilters(value: unknown): HomeDishFilters {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const pick = <Key extends keyof HomeDishFilters>(key: Key): HomeDishFilters[Key] =>
    (FILTER_VALUES[key] as readonly unknown[]).includes(raw[key])
      ? (raw[key] as HomeDishFilters[Key])
      : DEFAULT_DISH_FILTERS[key];
  return { price: pick("price"), ready: pick("ready"), distance: pick("distance") };
}
const HOME_FOOD_PREFERENCES = new Set<HomeFoodPreference>([
  "all",
  "veg",
  "non-veg",
  "egg",
]);

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function isHomeDishSort(value: unknown): value is HomeDishSort {
  return typeof value === "string" && HOME_DISH_SORTS.has(value as HomeDishSort);
}

function isHomeFoodPreference(value: unknown): value is HomeFoodPreference {
  return (
    typeof value === "string" &&
    HOME_FOOD_PREFERENCES.has(value as HomeFoodPreference)
  );
}

export function saveHomeReturnState(
  state: Omit<HomeReturnState, "savedAt">,
): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(
      HOME_RETURN_STATE_KEY,
      JSON.stringify({ ...state, savedAt: Date.now() }),
    );
  } catch {
    // Session storage is an enhancement. Navigation must still work without it.
  }
}

export function readHomeReturnState(): HomeReturnState | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.sessionStorage.getItem(HOME_RETURN_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HomeReturnState>;
    if (
      typeof parsed.scrollY !== "number" ||
      typeof parsed.searchTerm !== "string" ||
      typeof parsed.searchOpen !== "boolean" ||
      (parsed.homeCategory !== null && typeof parsed.homeCategory !== "string") ||
      typeof parsed.savedAt !== "number"
    ) {
      clearHomeReturnState();
      return null;
    }
    if (Date.now() - parsed.savedAt > HOME_RETURN_STATE_TTL_MS) {
      clearHomeReturnState();
      return null;
    }

    return {
      scrollY: parsed.scrollY,
      searchTerm: parsed.searchTerm,
      searchOpen: parsed.searchOpen,
      homeCategory: parsed.homeCategory ?? null,
      dishSort: isHomeDishSort(parsed.dishSort) ? parsed.dishSort : "recommended",
      foodPreference: isHomeFoodPreference(parsed.foodPreference)
        ? parsed.foodPreference
        : "all",
      dishFilters: parseDishFilters(parsed.dishFilters),
      savedAt: parsed.savedAt,
    };
  } catch {
    clearHomeReturnState();
    return null;
  }
}

export function hasHomeReturnState(): boolean {
  return readHomeReturnState() !== null;
}

export function clearHomeReturnState(): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(HOME_RETURN_STATE_KEY);
  } catch {
    // Ignore unavailable session storage.
  }
}

export type HomeReturnState = {
  scrollY: number;
  searchTerm: string;
  searchOpen: boolean;
  homeCategory: string | null;
  savedAt: number;
};

const HOME_RETURN_STATE_KEY = "craves:customer-home-return-state";
const HOME_RETURN_STATE_TTL_MS = 30 * 60 * 1000;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
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
    return parsed as HomeReturnState;
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

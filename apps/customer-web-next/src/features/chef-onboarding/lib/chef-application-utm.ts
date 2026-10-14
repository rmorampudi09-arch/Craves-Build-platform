/** utm_source, utm_medium, utm_campaign and utm_content of the marketing link that brought an applicant. */
export type ChefUtm = { source: string | null; medium: string | null; campaign: string | null; content: string | null };

const STORAGE_KEY = "craves.chef-application.utm";

// Same rule as ChefOnboardingPolicy.utm in user-chef-service: short plain values, lowercased; others are dropped.
function value(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim().toLowerCase();
  return /^[a-z0-9_.-]{1,64}$/.test(text) ? text : null;
}

/** The valid utm values of { source, medium, campaign, content }, or null when none is valid. */
export function parseUtm(raw: unknown): ChefUtm | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const utm = { source: value(input.source), medium: value(input.medium), campaign: value(input.campaign), content: value(input.content) };
  return utm.source || utm.medium || utm.campaign || utm.content ? utm : null;
}

export function utmFromSearch(search: string): ChefUtm | null {
  const params = new URLSearchParams(search);
  return parseUtm({
    source: params.get("utm_source"),
    medium: params.get("utm_medium"),
    campaign: params.get("utm_campaign"),
    content: params.get("utm_content"),
  });
}

/**
 * First touch for this tab: the first link with utm values wins. It is kept because step URLs (?step=)
 * and "Sign in again" drop the query before the first save. The server keeps only the first save's values.
 */
export function firstTouchUtm(search: string, getStorage: () => Pick<Storage, "getItem" | "setItem">): ChefUtm | null {
  try {
    // Reading window.sessionStorage itself throws when the browser blocks storage.
    const storage = getStorage();
    const saved = parseUtm(JSON.parse(storage.getItem(STORAGE_KEY) ?? "null"));
    if (saved) return saved;
    const found = utmFromSearch(search);
    if (found) storage.setItem(STORAGE_KEY, JSON.stringify(found));
    return found;
  } catch {
    // Blocked or corrupt storage: the current link still counts.
    return utmFromSearch(search);
  }
}

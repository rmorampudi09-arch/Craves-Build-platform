export type CustomerFavorite = {
  menuItemId: string;
  createdAt: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_FAVORITES = 200;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function parseCustomerFavorite(value: unknown): CustomerFavorite | null {
  const raw = record(value);
  if (!raw) return null;

  const menuItemId = raw.menuItemId;
  const createdAt = raw.createdAt;
  if (
    typeof menuItemId !== "string" ||
    !UUID_PATTERN.test(menuItemId) ||
    typeof createdAt !== "string" ||
    createdAt.length > 64 ||
    Number.isNaN(Date.parse(createdAt))
  ) {
    return null;
  }

  return { menuItemId, createdAt };
}

export function parseCustomerFavorites(value: unknown): CustomerFavorite[] | null {
  if (!Array.isArray(value) || value.length > MAX_FAVORITES) return null;

  const parsed: CustomerFavorite[] = [];
  for (const candidate of value) {
    const favorite = parseCustomerFavorite(candidate);
    if (!favorite) return null;
    parsed.push(favorite);
  }
  return parsed;
}

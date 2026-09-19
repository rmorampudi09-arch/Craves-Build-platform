export type LocationSearchResult = {
  id: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  houseNumber: string | null;
  street: string | null;
  area: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function optionalText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result || null;
}

function parseResult(value: unknown): LocationSearchResult | null {
  const raw = object(value);
  if (!raw) return null;
  const id = optionalText(raw.id);
  const formattedAddress = optionalText(raw.formattedAddress);
  const latitude =
    typeof raw.latitude === "number" ? raw.latitude : Number.NaN;
  const longitude =
    typeof raw.longitude === "number" ? raw.longitude : Number.NaN;

  if (
    !id ||
    !formattedAddress ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return {
    id,
    formattedAddress,
    latitude,
    longitude,
    houseNumber: optionalText(raw.houseNumber),
    street: optionalText(raw.street),
    area: optionalText(raw.area),
    district: optionalText(raw.district),
    city: optionalText(raw.city),
    state: optionalText(raw.state),
    postalCode: optionalText(raw.postalCode),
  };
}

export async function searchLocations(
  query: string,
  near?: { latitude: number; longitude: number } | null,
): Promise<LocationSearchResult[]> {
  const response = await fetch("/api/location/search", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      ...(near ?? {}),
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      body &&
        typeof body === "object" &&
        "message" in body &&
        typeof body.message === "string"
        ? body.message
        : "Address search is unavailable right now.",
    );
  }

  const root = object(body);
  const values = root && Array.isArray(root.results) ? root.results : [];
  return values
    .map(parseResult)
    .filter((result): result is LocationSearchResult => Boolean(result));
}

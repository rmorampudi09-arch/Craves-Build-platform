export type ReverseGeocodedAddress = {
  formattedAddress: string;
  houseNumber: string | null;
  street: string | null;
  area: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  confidence: "High" | "Medium" | "Low" | null;
  preciseHouseNumber: boolean;
};

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function firstText(values: unknown[]): string | null {
  for (const value of values) {
    const candidate = text(value);
    if (candidate) return candidate;
  }
  return null;
}

/** Ola Maps uses Google-style address component types. */
function componentReader(address: JsonObject) {
  const components = Array.isArray(address.address_components)
    ? address.address_components.map(object).filter((item): item is JsonObject => Boolean(item))
    : [];
  return (...types: string[]): string | null => {
    for (const type of types) {
      const match = components.find((item) => Array.isArray(item.types) && item.types.includes(type));
      const value = match ? firstText([match.long_name, match.short_name]) : null;
      if (value) return value;
    }
    return null;
  };
}

const CONFIDENCE: Record<string, ReverseGeocodedAddress["confidence"]> = {
  rooftop: "High",
  range_interpolated: "Medium",
  geometric_center: "Medium",
  approximate: "Low",
};

/** Maps an Ola Maps reverse-geocode body into the provider-neutral Craves address. */
export function parseOlaReverseGeocode(value: unknown): ReverseGeocodedAddress | null {
  const root = object(value);
  const results = root && Array.isArray(root.results) ? root.results : [];
  const result = results.map(object).find((item) => item && text(item.formatted_address)) ?? null;
  if (!result) return null;

  const formattedAddress = text(result.formatted_address)!;
  const component = componentReader(result);
  const houseNumber = component("street_number", "premise");
  const district = component("administrative_area_level_2");
  const locality = component("locality");
  const geometry = object(result.geometry);
  const locationType = text(geometry?.location_type)?.toLowerCase() ?? "";

  return {
    formattedAddress,
    houseNumber,
    street: component("route", "street_address"),
    area: firstText([
      component("sublocality_level_1", "sublocality", "neighborhood", "sublocality_level_2"),
      locality,
      district,
    ]),
    city: firstText([locality, component("administrative_area_level_3"), district]),
    district,
    state: component("administrative_area_level_1"),
    // Indian PIN codes are six digits; the formatted line is the fallback when no component exists.
    postalCode: component("postal_code") ?? formattedAddress.match(/\b[1-9]\d{5}\b/)?.[0] ?? null,
    country: component("country"),
    confidence: CONFIDENCE[locationType] ?? null,
    preciseHouseNumber: Boolean(houseNumber),
  };
}

export function bestAddressLine1(address: ReverseGeocodedAddress): string {
  if (address.houseNumber && address.street) return `${address.houseNumber}, ${address.street}`;
  if (address.houseNumber) return address.houseNumber;
  if (address.street) return address.street;
  return address.formattedAddress;
}

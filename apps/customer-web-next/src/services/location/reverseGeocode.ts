import {
  parseReverseGeocodedAddress,
  type ReverseGeocodedAddress,
} from "@/lib/location-contract";

export async function reverseGeocodeCurrentLocation(
  latitude: number,
  longitude: number,
): Promise<ReverseGeocodedAddress> {
  const response = await fetch("/api/location/reverse-geocode", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ latitude, longitude }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body && typeof body.message === "string"
        ? body.message
        : "Craves could not identify this address right now.";
    throw new Error(message);
  }
  const parsed = parseReverseGeocodedAddress({
    features: [{ properties: { address: body, confidence: body?.confidence } }],
  });
  if (parsed) return parsed;

  // The BFF intentionally returns the already-sanitized address contract rather
  // than the Azure Maps provider payload. Validate that shape before use.
  if (
    body
    && typeof body === "object"
    && typeof body.formattedAddress === "string"
    && typeof body.preciseHouseNumber === "boolean"
  ) {
    return body as ReverseGeocodedAddress;
  }
  throw new Error("Craves returned an invalid location response.");
}

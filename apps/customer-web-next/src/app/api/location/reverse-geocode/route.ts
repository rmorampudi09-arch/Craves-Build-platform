import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/request-security";
import { reverseGeocodeWithAzureMaps } from "@/lib/server/azure-maps";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: "ORIGIN_REJECTED", message: "Reverse geocoding is only available from Craves." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    latitude?: unknown;
    longitude?: unknown;
  } | null;
  const latitude = typeof body?.latitude === "number" ? body.latitude : Number.NaN;
  const longitude = typeof body?.longitude === "number" ? body.longitude : Number.NaN;

  if (
    !Number.isFinite(latitude)
    || latitude < -90
    || latitude > 90
    || !Number.isFinite(longitude)
    || longitude < -180
    || longitude > 180
  ) {
    return NextResponse.json(
      { error: "INVALID_LOCATION", message: "A valid current location is required." },
      { status: 400 },
    );
  }

  try {
    const address = await reverseGeocodeWithAzureMaps(latitude, longitude);
    return NextResponse.json(address, {
      headers: {
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Azure Maps reverse geocoding failed", error);
    return NextResponse.json(
      {
        error: "REVERSE_GEOCODING_UNAVAILABLE",
        message: "Craves could not identify this address right now. Please try again.",
      },
      { status: 503 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";
import { fleetError, matchFleetRoute, UUID, type FleetFile, type FleetRoute } from "./fleet-common";
import { RIDER_ROUTES } from "./rider-contract";
import { TRIP_ROUTES } from "./trip-contract";
import { PAYOUT_ROUTES } from "./payout-contract";

export const FLEET_ROUTES: readonly FleetRoute[] = [...RIDER_ROUTES, ...TRIP_ROUTES, ...PAYOUT_ROUTES];

const NO_STORE = { "Cache-Control": "no-store, private", Pragma: "no-cache" };

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ code, message }, { status, headers: NO_STORE });
}

/** Forwards only the listed admin fleet operations; the backend authorizes roles and records the acting admin. */
export async function fleetProxy(request: NextRequest, segments: string[], routes: readonly FleetRoute[] = FLEET_ROUTES) {
  const match = matchFleetRoute(routes, request.method, segments);
  if (!match) return fail(404, "FLEET_OPERATION_NOT_FOUND", "This fleet operation does not exist.");
  const { route, ids } = match;

  const query = new URLSearchParams();
  for (const [name, value] of request.nextUrl.searchParams) {
    if (!route.query?.[name]?.safeParse(value).success) return fail(400, "INVALID_FLEET_QUERY", `The ${name} filter is not valid.`);
    query.set(name, value);
  }

  const init: RequestInit = { method: route.method };
  if (route.method !== "GET") {
    const bounded = await boundBffRequest(request);
    if (bounded instanceof NextResponse) return bounded;
    const key = bounded.headers.get("idempotency-key") ?? "";
    if (!UUID.test(key)) return fail(400, "IDEMPOTENCY_KEY_REQUIRED", "Reload the page and try again.");
    const headers: Record<string, string> = { "Idempotency-Key": key };
    if (route.body) {
      const parsed = route.body.safeParse(await bounded.json().catch(() => undefined));
      if (!parsed.success) return fail(400, "INVALID_FLEET_REQUEST", parsed.error.issues[0]?.message ?? "Check the details and try again.");
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(parsed.data);
    }
    init.headers = headers;
  }

  const search = query.toString();
  try {
    const upstream = await authenticatedApiFetch(request, `/admin/fleet/${segments.join("/")}${search ? `?${search}` : ""}`, init, 20_000, route.file?.maxBytes);
    if (!upstream.ok) {
      const error = fleetError(upstream.status, await upstream.json().catch(() => null));
      return fail(upstream.status >= 400 && upstream.status <= 599 ? upstream.status : 502, error.code, error.message);
    }
    if (route.file) return fileResponse(upstream, route.file, ids, query);
    const parsed = route.response!.safeParse(await upstream.json().catch(() => null));
    return parsed.success
      ? NextResponse.json(parsed.data, { status: upstream.status, headers: NO_STORE })
      : fail(502, "INVALID_FLEET_RESPONSE", "The fleet service sent an unexpected answer. Refresh and check before trying again.");
  } catch (error) {
    return error instanceof SessionRequiredError
      ? fail(401, "AUTHENTICATION_REQUIRED", "Your session has ended. Sign in again.")
      : fail(503, "FLEET_UNAVAILABLE", "The fleet service is unavailable. Try again shortly.");
  }
}

async function fileResponse(upstream: Response, file: FleetFile, ids: string[], query: URLSearchParams) {
  const type = upstream.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!file.types.includes(type)) return fail(502, "INVALID_FLEET_FILE", "The fleet service sent an unexpected file.");
  const bytes = await upstream.arrayBuffer();
  if (bytes.byteLength < 1 || bytes.byteLength > file.maxBytes) return fail(502, "INVALID_FLEET_FILE", "The fleet service sent an unexpected file.");
  return new NextResponse(bytes, { headers: {
    ...NO_STORE, "Content-Type": type, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox",
    "Content-Disposition": file.attachment ? `attachment; filename="${file.attachment(ids, query)}"` : "inline",
  } });
}

import { NextRequest, NextResponse } from "next/server";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";
import { matchFleetRoute } from "@/features/admin/fleet/lib/fleet-common";
import { DELIVERY_EXCEPTION_ROUTES, exceptionError } from "./delivery-exception-contract";

const NO_STORE = { "Cache-Control": "no-store, private", Pragma: "no-cache" };
const fail = (status: number, code: string, message: string) => NextResponse.json({ code, message }, { status, headers: NO_STORE });

/** Forwards only the four case operations; integration-service authorizes roles and records the acting admin. */
export async function deliveryExceptionProxy(request: NextRequest, segments: string[]) {
  const match = matchFleetRoute(DELIVERY_EXCEPTION_ROUTES, request.method, segments.length ? segments : [""]);
  if (!match) return fail(404, "OPERATION_NOT_FOUND", "This delivery exception operation does not exist.");
  const { route } = match;

  const query = new URLSearchParams();
  for (const [name, value] of request.nextUrl.searchParams) {
    const schema = route.query && Object.hasOwn(route.query, name) ? route.query[name] : undefined;
    if (!schema?.safeParse(value).success) return fail(400, "INVALID_QUERY", `The ${name} filter is not valid.`);
    query.set(name, value);
  }

  const init: RequestInit = { method: route.method };
  if (route.method === "POST") {
    const bounded = await boundBffRequest(request); // also refuses another origin
    if (bounded instanceof NextResponse) return bounded;
    const parsed = route.body!.safeParse(await bounded.json().catch(() => undefined));
    if (!parsed.success) return fail(400, "INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Check the details and try again.");
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(parsed.data);
  }

  const path = `/admin/operations/delivery-exceptions${segments.length ? `/${segments.join("/")}` : ""}`;
  const search = query.toString();
  try {
    const upstream = await authenticatedApiFetch(request, `${path}${search ? `?${search}` : ""}`, init, 15_000, 1024 * 1024);
    if (!upstream.ok) {
      const error = exceptionError(upstream.status, await upstream.json().catch(() => null));
      return fail(upstream.status >= 400 && upstream.status <= 599 ? upstream.status : 502, error.code, error.message);
    }
    const parsed = route.response!.safeParse(await upstream.json().catch(() => null));
    return parsed.success
      ? NextResponse.json(parsed.data, { status: upstream.status, headers: NO_STORE })
      : fail(502, "INVALID_RESPONSE", "The delivery service sent an unexpected answer. Refresh and check before trying again.");
  } catch (error) {
    return error instanceof SessionRequiredError
      ? fail(401, "AUTHENTICATION_REQUIRED", "Your session has ended. Sign in again.")
      : fail(503, "DELIVERY_EXCEPTIONS_UNAVAILABLE", "The delivery service is unavailable. Try again shortly.");
  }
}

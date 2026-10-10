import { chefUpstream } from "@/lib/chef-errors";
import { boundedFetch } from "@/lib/bounded-fetch";
import { boundBffRequest } from "@/lib/bff-request-limits";
import { isSameOrigin } from "@/lib/request-security";
import { NextRequest, NextResponse } from "next/server";
import {
  parseChefKitchen,
  parseChefKitchenInput,
} from "@/lib/chef-kitchen-contract";

export const dynamic = "force-dynamic";
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", Pragma: "no-cache" };

function apiBaseUrl(): string {
  const value = process.env.CRAVES_API_BASE_URL?.trim();
  if (!value?.startsWith("https://"))
    throw new Error("CRAVES_API_BASE_URL must use HTTPS");
  return value.replace(/\/$/, "");
}

async function call(
  request: NextRequest,
  method: "GET" | "PUT",
  body?: unknown,
) {
  const token = request.cookies.get("craves_access_token")?.value;
  if (!token)
    return NextResponse.json(
      { code: "AUTHENTICATION_REQUIRED" },
      { status: 401, headers: PRIVATE_HEADERS },
    );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const upstream = await boundedFetch(`${apiBaseUrl()}/kitchens/me`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    }, 40_000);
    const raw: unknown = await upstream.json().catch(() => null);
    if (method === "GET" && upstream.status === 404 && raw &&
        typeof raw === "object" && "code" in raw && raw.code === "KITCHEN_PROFILE_NOT_FOUND")
      return NextResponse.json(null, {
        status: 200,
        headers: PRIVATE_HEADERS,
      });
    if (!upstream.ok) {
      const precise = chefUpstream(raw);
      const response = NextResponse.json(
        {
          reason: precise.reason,
          code:
            upstream.status === 401
              ? "SESSION_EXPIRED"
              : upstream.status === 403
                ? "CHEF_ACCESS_REQUIRED"
                : "KITCHEN_REQUEST_FAILED",
          message: precise.message ?? (
            upstream.status === 401
              ? "Your session expired. Sign in again."
              : upstream.status === 403
                ? "An approved CHEF role is required. Sign out and sign in again after approval."
                : upstream.status === 400
                  ? "Complete the required kitchen fields using valid values."
                  : "Kitchen profile is temporarily unavailable."),
        },
        { status: upstream.status, headers: PRIVATE_HEADERS },
      );
      if (upstream.status === 401)
        response.cookies.delete("craves_access_token");
      return response;
    }
    const kitchen = parseChefKitchen(raw);
    if (!kitchen)
      return NextResponse.json(
        { code: "INVALID_KITCHEN_RESPONSE" },
        { status: 502, headers: PRIVATE_HEADERS },
      );
    return NextResponse.json(kitchen, { headers: PRIVATE_HEADERS });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      { code: timedOut ? "KITCHEN_TIMEOUT" : "KITCHEN_UNAVAILABLE" },
      { status: timedOut ? 504 : 503, headers: PRIVATE_HEADERS },
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest) {
  return call(request, "GET");
}
export async function PUT(request: NextRequest) {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  request = bounded;

  if (!isSameOrigin(request))
    return NextResponse.json({ code: "ORIGIN_REJECTED" }, { status: 403, headers: PRIVATE_HEADERS });
  const input = parseChefKitchenInput(await request.json().catch(() => null));
  if (!input)
    return NextResponse.json(
      {
        code: "INVALID_KITCHEN_PROFILE",
        message:
          "Complete the required kitchen fields. Open kitchens require a pickup phone, area, pincode, and valid map coordinates before they can accept orders.",
      },
      { status: 400, headers: PRIVATE_HEADERS },
    );
  return call(request, "PUT", input);
}

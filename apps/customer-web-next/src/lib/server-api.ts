import { parseAdminIdentity } from "./admin-contract.ts";
import { apiTarget } from "./api-target.ts";
import { NextRequest } from "next/server";

export class SessionRequiredError extends Error {}

export function apiBaseUrl(): string {
  const value = process.env.CRAVES_API_BASE_URL?.trim();
  if (!value?.startsWith("https://")) throw new Error("CRAVES_API_BASE_URL must use HTTPS");
  return value.replace(/\/$/, "");
}

export async function authenticatedApiFetch(
  request: NextRequest,
  path: string,
  init: RequestInit = {},
  timeoutMs = 10_000,
): Promise<Response> {
  const token = request.cookies.get("craves_access_token")?.value;
  if (!token) throw new SessionRequiredError("Customer session is required");
  if (!path.startsWith("/") || path.includes("..") || /[\r\n]/.test(path)) {
    throw new Error("Invalid API path");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (request.nextUrl.pathname.startsWith("/api/admin/") && path !== "/auth/me") {
      const verified = await fetch(`${apiBaseUrl()}/auth/me`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        cache: "no-store", signal: controller.signal,
      });
      if (!verified.ok) return verified;
      const identity = parseAdminIdentity(await verified.json().catch(() => null));
      if (!identity) return Response.json({ code: "IDENTITY_UNAVAILABLE" }, { status: 502 });
      if (!identity.adminEnabled) return Response.json({ code: "ADMIN_ACCESS_REQUIRED" }, { status: 403 });
    }
    return await fetch(apiTarget(apiBaseUrl(), path), {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

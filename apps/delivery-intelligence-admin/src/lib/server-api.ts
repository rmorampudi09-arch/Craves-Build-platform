import { parseAdminIdentity } from "./admin-contract.ts";
import type { NextRequest } from "next/server";

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
  if (!token) throw new SessionRequiredError("Craves admin session is required");
  if (!path.startsWith("/") || path.includes("..") || /[\r\n]/.test(path)) {
    throw new Error("Invalid API path");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (true && path !== "/auth/me") {
      const verified = await fetch(`${apiBaseUrl()}/auth/me`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        cache: "no-store", signal: controller.signal,
      });
      if (!verified.ok) return verified;
      const identity = parseAdminIdentity(await verified.json().catch(() => null));
      if (!identity) return Response.json({ code: "IDENTITY_UNAVAILABLE" }, { status: 502 });
      if (!identity.adminEnabled) return Response.json({ code: "ADMIN_ACCESS_REQUIRED" }, { status: 403 });
    }
    return await fetch(`${apiBaseUrl()}${path}`, {
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

export function safeReference(value: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value).trim();
  } catch {
    return null;
  }
  if (!decoded || decoded.length > 200 || /[\r\n]/.test(decoded)) return null;
  return decoded;
}

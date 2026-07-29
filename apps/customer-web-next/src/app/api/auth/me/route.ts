import { NextRequest, NextResponse } from "next/server";
import { parseSessionExchange } from "@/lib/auth-contract";

export const dynamic = "force-dynamic";

function apiBaseUrl(): string {
  const value = process.env.CRAVES_API_BASE_URL?.trim();
  if (!value?.startsWith("https://")) throw new Error("CRAVES_API_BASE_URL must use HTTPS");
  return value.replace(/\/$/, "");
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("craves_access_token")?.value;
  if (!token) return NextResponse.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const upstream = await fetch(`${apiBaseUrl()}/auth/me`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal
    });
    if (!upstream.ok) {
      const response = NextResponse.json({ code: upstream.status === 401 ? "SESSION_EXPIRED" : "IDENTITY_UNAVAILABLE" }, { status: upstream.status });
      if (upstream.status === 401) response.cookies.delete("craves_access_token");
      return response;
    }
    const raw = await upstream.json().catch(() => null);
    const identity = raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
    if (!identity || typeof identity.id !== "string" || typeof identity.phoneNumber !== "string") {
      return NextResponse.json({ code: "INVALID_IDENTITY_RESPONSE" }, { status: 502 });
    }
    const response = NextResponse.json({
      id: identity.id,
      phoneNumber: identity.phoneNumber,
      email: typeof identity.email === "string" ? identity.email : null,
      emailVerified: identity.emailVerified === true,
      displayName: typeof identity.displayName === "string" ? identity.displayName : null,
      status: typeof identity.status === "string" ? identity.status : "UNKNOWN",
      roles: Array.isArray(identity.roles) ? identity.roles.filter(role => typeof role === "string").slice(0, 10) : []
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return NextResponse.json({ code: "IDENTITY_UNAVAILABLE" }, { status: 503 });
  } finally {
    clearTimeout(timeout);
  }
}

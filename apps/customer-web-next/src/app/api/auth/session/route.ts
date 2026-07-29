import { NextRequest, NextResponse } from "next/server";
import { parseSessionExchange, publicAuthError } from "@/lib/auth-contract";

export const dynamic = "force-dynamic";

function apiBaseUrl(): string {
  const value = process.env.CRAVES_API_BASE_URL?.trim();
  if (!value?.startsWith("https://")) throw new Error("CRAVES_API_BASE_URL must use HTTPS");
  return value.replace(/\/$/, "");
}

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const supplied = new URL(origin);
    const current = new URL(request.url);
    return supplied.protocol === current.protocol && supplied.host === current.host;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ code: "ORIGIN_REJECTED", message: "Invalid sign-in origin." }, { status: 403 });
  }

  let firebaseIdToken = "";
  try {
    const body = await request.json() as { firebaseIdToken?: unknown };
    firebaseIdToken = typeof body.firebaseIdToken === "string" ? body.firebaseIdToken.trim() : "";
  } catch {
    return NextResponse.json({ code: "INVALID_REQUEST", message: "Invalid sign-in request." }, { status: 400 });
  }
  if (firebaseIdToken.length < 100 || firebaseIdToken.length > 20_000) {
    return NextResponse.json({ code: "INVALID_FIREBASE_TOKEN", message: "Firebase verification is required." }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const upstream = await fetch(`${apiBaseUrl()}/auth/firebase/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ firebaseIdToken }),
      cache: "no-store",
      signal: controller.signal
    });
    const raw = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      return NextResponse.json({ code: "SIGN_IN_FAILED", message: publicAuthError(upstream.status) }, { status: upstream.status });
    }
    const session = parseSessionExchange(raw);
    if (!session) {
      return NextResponse.json({ code: "INVALID_AUTH_RESPONSE", message: "Sign-in is temporarily unavailable." }, { status: 502 });
    }

    const response = NextResponse.json({ identity: session.identity }, { status: 200 });
    response.cookies.set("craves_access_token", session.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: session.expiresIn
    });
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    response.headers.set("Pragma", "no-cache");
    return response;
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json({
      code: timedOut ? "AUTH_TIMEOUT" : "AUTH_UNAVAILABLE",
      message: timedOut ? "Sign-in timed out. Please try again." : "Sign-in is temporarily unavailable."
    }, { status: timedOut ? 504 : 503 });
  } finally {
    clearTimeout(timeout);
  }
}

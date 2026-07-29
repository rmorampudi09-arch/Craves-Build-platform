import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  let accepted = false;
  if (origin) {
    try {
      const supplied = new URL(origin);
      const current = new URL(request.url);
      accepted = supplied.protocol === current.protocol && supplied.host === current.host;
    } catch {
      accepted = false;
    }
  }
  if (!accepted) return NextResponse.json({ code: "ORIGIN_REJECTED" }, { status: 403 });

  const response = NextResponse.json({ signedOut: true });
  response.cookies.set("craves_access_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

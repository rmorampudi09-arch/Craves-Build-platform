import { NextRequest } from "next/server";

export function isSameOrigin(request: NextRequest): boolean {
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

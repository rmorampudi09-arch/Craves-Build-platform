import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { isSameOrigin } from "../../../shared/lib/request-security";

export const WEB_LAUNCH_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
};

export function hasLaunchKey(request: NextRequest, now = Date.now()): boolean {
  const hash = process.env.CRAVES_WEB_LAUNCH_KEY_SHA256 ?? "";
  const expiry = Date.parse(process.env.CRAVES_WEB_LAUNCH_KEY_EXPIRES_AT ?? "");
  const authorization = request.headers.get("authorization") ?? "";
  if (!/^[0-9a-f]{64}$/.test(hash) || !Number.isFinite(expiry) || now >= expiry || !/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization)) return false;
  const supplied = createHash("sha256").update(authorization.slice(7)).digest();
  return timingSafeEqual(supplied, Buffer.from(hash, "hex"));
}

export function isLaunchMutationOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const allowed = process.env.NODE_ENV === "production"
    ? ["https://craves.in", "https://www.craves.in"]
    : ["https://craves.in", "https://www.craves.in", "http://localhost:3000", "http://127.0.0.1:3000"];
  return origin !== null && allowed.includes(origin) && isSameOrigin(request);
}

export function launchExemptPath(path: string): boolean {
  if (["/pilot-launch", "/api/web-launch/control", "/api/web-launch/status", "/api/version", "/api/readiness/razorpay", "/robots.txt", "/sitemap.xml", "/favicon.ico", "/privacy", "/terms", "/contact", "/products-pricing", "/refunds-cancellations", "/security"].includes(path)) return true;
  if (path.startsWith("/_next/static/") || path === "/_next/image" || path.startsWith("/.well-known/acme-challenge/")) return true;
  // Assets only: a dot or a forged file extension on an API is never a bypass.
  return !path.startsWith("/api/") && /\.(?:css|js|mjs|map|png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|otf|mp4|webm)$/i.test(path);
}

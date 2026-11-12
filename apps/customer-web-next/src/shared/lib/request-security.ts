import { isIP } from "node:net";
import type { NextRequest } from "next/server";

/**
 * The TCP peer Front Door saw, as a key for per-visitor limits: an IPv4 address, or an IPv6 /64 (a phone or a home
 * gets a whole /64 to pick addresses from). X-Forwarded-For and X-Azure-ClientIP are caller-written, so they never
 * key a limit; anything but a literal address is null.
 */
export function socketPeerKey(request: NextRequest): string | null {
  const ip = request.headers.get("x-azure-socketip")?.trim() ?? "";
  const version = isIP(ip);
  if (version === 4) return ip;
  if (version !== 6) return null;
  if (ip.includes(".")) return ip.slice(ip.lastIndexOf(":") + 1); // IPv4-mapped, ::ffff:a.b.c.d
  const [head, tail = ""] = ip.split("::");
  const groups = head.split(":").filter(Boolean);
  const rest = tail.split(":").filter(Boolean);
  const full = [...groups, ...Array<string>(8 - groups.length - rest.length).fill("0"), ...rest];
  return `${full.slice(0, 4).map((group) => group.toLowerCase().padStart(4, "0")).join(":")}::/64`;
}

type OriginCheckInput = {
  origin: string | null;
  requestUrl: string;
  forwardedProto?: string | null;
  forwardedHost?: string | null;
  host?: string | null;
};

function lastForwardedValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const values = value.split(",").map((part) => part.trim()).filter(Boolean);
  return values.at(-1) ?? null;
}

function parseOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function forwardedOrigin(
  proto: string | null | undefined,
  host: string | null | undefined,
): string | null {
  const publicProto = lastForwardedValue(proto)?.toLowerCase();
  const publicHost = lastForwardedValue(host);
  if ((publicProto !== "https" && publicProto !== "http") || !publicHost) return null;
  return parseOrigin(`${publicProto}://${publicHost}`);
}

export function isRequestOriginAllowed(input: OriginCheckInput): boolean {
  if (!input.origin) return false;
  const suppliedOrigin = parseOrigin(input.origin);
  if (!suppliedOrigin) return false;

  try {
    if (suppliedOrigin === new URL(input.requestUrl).origin) return true;
  } catch {
    return false;
  }

  const publicHost = input.forwardedHost || input.host;
  return suppliedOrigin === forwardedOrigin(input.forwardedProto, publicHost);
}

export function isSameOrigin(request: NextRequest): boolean {
  return isRequestOriginAllowed({
    origin: request.headers.get("origin"),
    requestUrl: request.url,
    forwardedProto: request.headers.get("x-forwarded-proto"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    host: request.headers.get("host"),
  });
}

/** Map image and tile loads send no Origin: accept a same-origin fetch or a Referer from this site. */
export function isSameSitePublicRequest(request: NextRequest): boolean {
  if (request.headers.get("sec-fetch-site") === "same-origin") return true;
  const referer = request.headers.get("referer");
  if (!referer) return false;
  let origin: string;
  try {
    origin = new URL(referer).origin;
  } catch {
    return false;
  }
  return isRequestOriginAllowed({
    origin,
    requestUrl: request.url,
    forwardedProto: request.headers.get("x-forwarded-proto"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    host: request.headers.get("host"),
  });
}

/** The origin the client used to reach this site (behind Front Door, the forwarded one). */
export function publicRequestOrigin(request: NextRequest): string {
  return (
    forwardedOrigin(
      request.headers.get("x-forwarded-proto"),
      request.headers.get("x-forwarded-host") || request.headers.get("host"),
    ) ?? new URL(request.url).origin
  );
}

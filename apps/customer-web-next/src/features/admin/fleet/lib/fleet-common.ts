import { z } from "zod";

// Shapes shared by every fleet screen. Contract: contracts/openapi/admin-fleet-v1.yaml.
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const id = z.string().regex(UUID);
export const instant = z.string().datetime({ offset: true });
export const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const personName = z.string().max(120);
export const reasonText = z.string().trim().min(3, "Write a reason of at least 3 characters.").max(1000);
export const reasonBody = z.object({ reason: reasonText });

export type FleetFile = {
  types: readonly string[];
  maxBytes: number;
  /** Download name for CSV files; images and PDFs open inline. */
  attachment?: (ids: string[], query: URLSearchParams) => string;
};

/** One BFF-forwarded admin fleet operation. ":id" segments must be UUIDs. */
export type FleetRoute = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, z.ZodType<string>>;
  body?: z.ZodTypeAny;
  response?: z.ZodTypeAny;
  file?: FleetFile;
};

export function matchFleetRoute(routes: readonly FleetRoute[], method: string, segments: readonly string[]) {
  for (const route of routes) {
    const parts = route.path.split("/");
    if (route.method !== method || parts.length !== segments.length) continue;
    if (parts.every((part, index) => part === ":id" ? UUID.test(segments[index]) : part === segments[index])) {
      return { route, ids: segments.filter((_, index) => parts[index] === ":id") };
    }
  }
  return null;
}

const DEFAULT_MESSAGES: Record<number, string> = {
  400: "Check the details and try again.",
  401: "Your session has ended. Sign in again.",
  403: "Your admin role can't do this.",
  404: "Not found. It may have changed; refresh the page.",
  409: "This changed since you loaded it. Refresh and check before trying again.",
  422: "The server refused this. Check the details.",
  429: "Too many requests. Wait a moment and try again.",
};

/** The server's own {code, message}, or a plain default for the status. */
export function fleetError(status: number, body: unknown): { code: string; message: string } {
  const raw = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const code = typeof raw.code === "string" && /^[A-Z0-9_]{1,80}$/.test(raw.code) ? raw.code : "FLEET_REQUEST_FAILED";
  // A role refusal never echoes the server's text, which could name roles; SAME_APPROVER is the one 403 that explains itself.
  const message = status === 403 && code !== "SAME_APPROVER" ? ""
    : typeof raw.message === "string" ? raw.message.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 500) : "";
  return { code, message: message || (DEFAULT_MESSAGES[status] ?? "The fleet service is unavailable. Try again shortly.") };
}

export function readableFleetValue(value: string): string {
  return value.toLowerCase().replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase());
}

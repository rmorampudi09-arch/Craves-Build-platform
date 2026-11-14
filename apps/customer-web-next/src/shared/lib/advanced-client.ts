import { sessionFetch } from "@/shared/lib/session-fetch";

/** One call to the advanced service through /api/advanced (advanced-bff.ts): the parsed answer, or the status and code. */
export type AdvancedResult<T> = { ok: true; data: T } | { ok: false; status: number; code: string };

/** For calls that answer 204 with no body. */
export const noBody = () => true as const;

/** Calls /api/advanced/<path>, parses the answer strictly, and never throws: a network failure is code NETWORK. */
export async function advancedCall<T>(path: string, parse: (body: unknown) => T | null, init: RequestInit = {}): Promise<AdvancedResult<T>> {
  try {
    const response = await sessionFetch(`/api/advanced/${path}`, {
      ...init,
      headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    });
    const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const code = body && typeof body === "object" && typeof (body as { code?: unknown }).code === "string" ? (body as { code: string }).code : "REQUEST_FAILED";
      return { ok: false, status: response.status, code };
    }
    const data = parse(body);
    return data === null ? { ok: false, status: 502, code: "INVALID_RESPONSE" } : { ok: true, data };
  } catch {
    return { ok: false, status: 0, code: "NETWORK" };
  }
}

/** A key for one attempt to make something (an Idempotency-Key). randomUUID needs a secure page and a 2022 browser, so fall back to time and chance. */
export function newAttemptKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

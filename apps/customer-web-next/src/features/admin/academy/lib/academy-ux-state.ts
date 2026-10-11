/** Presentation policy only. Authentication, quiz grading and XP remain server-owned. */
export type AcademyProblemKind = "session" | "permission" | "offline" | "timeout" | "conflict" | "rate-limit" | "unavailable";
export type AcademyProblem = { kind: AcademyProblemKind; title: string; description: string; retryable: boolean; retryAfter: number };
export class AcademyRequestError extends Error {
  readonly status: number;
  readonly retryAfter: number;
  constructor(status: number, retryAfter = 0) {
    super(`Academy request failed (${status})`);
    this.name = "AcademyRequestError";
    this.status = status;
    this.retryAfter = Math.min(86400, Math.max(0, Math.ceil(retryAfter)));
  }
}
export function parseRetryAfter(value: string | null, now = Date.now()): number {
  if (!value) return 30;
  const seconds = /^\d+$/.test(value) ? Number(value) : (Date.parse(value) - now) / 1000;
  return Number.isFinite(seconds) ? Math.max(1, Math.min(86400, Math.ceil(seconds))) : 30;
}
export function academyProblem(error: unknown, offline = false): AcademyProblem {
  const base = { retryable: true, retryAfter: 0 };
  const status = error instanceof AcademyRequestError ? error.status : 0;
  if (status === 401) return { ...base, kind: "session", title: "Let’s get you signed back in", description: "Your administrator session has expired. Sign in again to continue securely.", retryable: false };
  if (status === 403) return { ...base, kind: "permission", title: "This area needs a different permission", description: "Your current administrator role cannot open this view. Return to the course library or contact your platform administrator.", retryable: false };
  if (offline) return { ...base, kind: "offline", title: "You’re offline. Your place is here.", description: "Reconnect, then retry. Answers and edits on this open screen are kept; new changes are not saved while offline." };
  if (status === 429) return { ...base, kind: "rate-limit", title: "A short pause before your next attempt", description: "Take a moment to review the explanation. A daily practice limit may also apply.", retryAfter: error instanceof AcademyRequestError ? error.retryAfter || 30 : 30 };
  if (status === 409) return { ...base, kind: "conflict", title: "This content needs a fresh check", description: "The course or record may have changed, or source review is required. Your current edits remain here. Reload deliberately before replacing them.", retryable: false };
  if (error instanceof Error && error.name === "AbortError") return { ...base, kind: "timeout", title: "This is taking longer than expected", description: "The connection timed out. Your current answers remain here. Retry checks the same submission instead of awarding XP twice." };
  return { ...base, kind: "unavailable", title: "We couldn’t load this part of Academy", description: status === 404 ? "The Academy route or feature is not available yet. Retry after the release configuration has been checked." : "A connection or service issue interrupted this request. Your current work stays on this screen. Retry when you’re ready." };
}
export function academyReturnTo(search: string): string {
  const params = new URLSearchParams(search);
  const output = new URLSearchParams();
  for (const key of ["course", "lesson"]) {
    const value = params.get(key);
    if (value && /^[a-z0-9-]{1,100}$/.test(value)) output.set(key, value);
  }
  return `/admin/academy${output.size ? `?${output}` : ""}`;
}
export const ACADEMY_MOTION = { fastMs: 160, enterMs: 240, slowMs: 320, staggerMs: 24, maxStaggerMs: 144 } as const;

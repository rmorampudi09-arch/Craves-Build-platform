import { sessionFetch } from "./session-fetch";
import { parseSupportCase, parseSupportCasePage, type SupportCase, type SupportCasePage } from "./support-cases-contract";

/** code is FEATURE_NOT_AVAILABLE (show Coming soon), SESSION_EXPIRED, a backend code, or SUPPORT_CASE_FAILED. */
export class SupportCaseError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

async function call<T>(path: string, parse: (value: unknown) => T | null, init: RequestInit = {}): Promise<T> {
  const response = await sessionFetch(path, { cache: "no-store", ...init });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = response.status === 401 ? "SESSION_EXPIRED" : (body as { code?: unknown } | null)?.code;
    throw new SupportCaseError(typeof code === "string" ? code : "SUPPORT_CASE_FAILED", response.status);
  }
  const parsed = parse(body);
  if (!parsed) throw new SupportCaseError("INVALID_SUPPORT_CASE_RESPONSE", 502);
  return parsed;
}

function post<T>(path: string, body: unknown, parse: (value: unknown) => T | null): Promise<T> {
  return call(path, parse, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export async function createSupportCase(input: { contextRole: "CHEF" | "CUSTOMER"; orderId?: string | null; subject: string; message: string }): Promise<SupportCase> {
  return post("/api/support/cases", { contextRole: input.contextRole, orderId: input.orderId ?? null, subject: input.subject, message: input.message }, parseSupportCase);
}

export async function listSupportCases(cursor?: string | null): Promise<SupportCasePage> {
  return call(`/api/support/cases${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, parseSupportCasePage);
}

export async function getSupportCase(caseId: string): Promise<SupportCase> {
  return call(`/api/support/cases/${encodeURIComponent(caseId)}`, parseSupportCase);
}

/** The backend answers a reply with the whole case, so no second read is needed. */
export async function replyToSupportCase(caseId: string, message: string): Promise<SupportCase> {
  return post(`/api/support/cases/${encodeURIComponent(caseId)}/messages`, { message }, parseSupportCase);
}

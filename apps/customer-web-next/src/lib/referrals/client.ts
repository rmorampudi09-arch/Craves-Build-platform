import { z } from "zod";
import { adminOverviewSchema, cashoutPageSchema, cashoutSchema, inboxPageSchema, overviewSchema, policyDraftSchema, policyPageSchema, queuePageSchema, rewardPageSchema, uuidSchema, type PolicyDraft } from "./contracts";

export type ReferralTransport = (input: string, init?: RequestInit) => Promise<Response>;
export class ReferralApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, public readonly uncertain = false) {
    super(referralMessage(code)); this.name = "ReferralApiError";
  }
}
export function referralMessage(code: string): string {
  const messages: Record<string, string> = {
    AUTHENTICATION_REQUIRED: "Your session needs verification. Sign in again.", ACCESS_DENIED: "This account does not have permission for this operation.",
    REFERRAL_ACCOUNT_NOT_ENROLLED_OR_INACTIVE: "Referral enrolment is not available for this account yet.",
    REFERRAL_PUBLIC_ACCESS_DISABLED: "The referral programme has not been opened to members yet.",
    REFERRALS_DISABLED: "The referral programme is currently paused.", CASHOUT_DISABLED: "Cash withdrawals are not enabled.",
    RECIPIENT_ON_HOLD: "A review is required before these funds can be used.", INSUFFICIENT_AVAILABLE_BALANCE: "Your available balance has changed. Refresh before requesting a withdrawal.",
    BELOW_CASHOUT_MINIMUM: "The request is below the current withdrawal minimum.", SECOND_APPROVER_REQUIRED: "A different administrator must approve this policy.",
    POLICY_REVISION_CONFLICT: "Another administrator changed the policy. Refresh and review the newest revision.",
    POLICY_ACTIVATION_CONFLICT: "The activation schedule changed. Refresh before approving.",
    TRANSFER_ALREADY_SUBMITTED_DO_NOT_RETRY: "This transfer has already been submitted. Do not create a replacement payment.",
    INVALID_RESPONSE: "The response could not be verified. No balances or success states have been invented.",
    REQUEST_UNCERTAIN: "The outcome is not yet known. Refresh the record or retry with the same operation reference; do not create a duplicate.",
    REQUEST_FAILED: "The service could not complete this request. Refresh and try again.",
    REVOCATION_VERIFICATION_UNAVAILABLE: "Session verification is temporarily unavailable. Please retry later."
  };
  return messages[code] ?? "The request was not accepted. Review the current account, funding and policy status before trying again.";
}
export function createReferralClient(transport: ReferralTransport = (input, init) => fetch(input, init)) {
  const base = "/api/referrals";
  async function request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
    const write = init.method === "POST";
    let response: Response;
    try {
      response = await transport(base + path, { ...init, cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json", ...(write ? { "Content-Type": "application/json" } : {}), ...init.headers } });
    } catch (error) {
      if (!write && init.signal?.aborted) throw error;
      throw new ReferralApiError(0, write ? "REQUEST_UNCERTAIN" : "REQUEST_FAILED", write);
    }
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const code = z.object({ code: z.string().regex(/^[A-Z0-9_]{1,100}$/) }).safeParse(body);
      throw new ReferralApiError(response.status, code.success ? code.data.code : response.status === 401 ? "AUTHENTICATION_REQUIRED" : "REQUEST_FAILED", write && response.status >= 500);
    }
    const raw: unknown = response.status === 204 ? null : await response.json().catch(() => undefined);
    const result = schema.safeParse(raw);
    if (!result.success) throw new ReferralApiError(502, "INVALID_RESPONSE", write);
    return result.data;
  }
  const page = (cursor?: string | null) => `?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
  const post = (path: string, body: unknown) => request(path, z.null(), { method: "POST", body: JSON.stringify(body) });
  const id = (value: string) => uuidSchema.parse(value);
  return {
    overview: (signal?: AbortSignal) => request("/me", overviewSchema, { signal }),
    rewards: (cursor?: string | null, signal?: AbortSignal) => request("/me/rewards" + page(cursor), rewardPageSchema, { signal }),
    cashouts: (cursor?: string | null, signal?: AbortSignal) => request("/me/cashouts" + page(cursor), cashoutPageSchema, { signal }),
    cashout: (requestId: string, amountPaise: string) => request("/me/cashouts", cashoutSchema, { method: "POST", body: JSON.stringify({ requestId: id(requestId), amountPaise }) }),
    cancelCashout: (requestId: string) => post(`/me/cashouts/${id(requestId)}/cancel`, {}),
    adminOverview: (signal?: AbortSignal) => request("/admin/overview", adminOverviewSchema, { signal }),
    policies: (signal?: AbortSignal) => request("/admin/policies", policyPageSchema, { signal }),
    createPolicy: (draft: PolicyDraft) => request("/admin/policies", z.object({ revision: z.string().regex(/^\d+$/), state: z.literal("DRAFT") }), { method: "POST", body: JSON.stringify(policyDraftSchema.parse(draft)) }),
    approvePolicy: (revision: string, effectiveAt: string, expectedLatestActivatedRevision: string) => {
      if (!/^[1-9]\d{0,18}$/.test(revision)) throw new Error("Invalid policy revision");
      return post(`/admin/policies/${revision}/approve`, { effectiveAt, expectedLatestActivatedRevision });
    },
    queue: (name: "fraud" | "cashouts" | "outbox", state: string, cursor?: string | null, signal?: AbortSignal) => request(`/admin/queues/${name}${page(cursor)}&state=${encodeURIComponent(state)}`, queuePageSchema, { signal }),
    inbox: (source: "auth" | "order" | "finance", afterId?: string | null, signal?: AbortSignal) => request(`/admin/inbox?source=${source}&limit=25${afterId ? `&afterId=${id(afterId)}` : ""}`, inboxPageSchema, { signal }),
    resolveFraud: (caseId: string, result: "CLEARED" | "CONFIRMED", evidenceRef: string) => post(`/admin/fraud/${id(caseId)}/resolve`, { result, evidenceRef }),
    reverseReward: (rewardId: string, operationId: string, amountPaise: string, reasonCode: string) => post(`/admin/rewards/${id(rewardId)}/reverse`, { operationId: id(operationId), amountPaise, reasonCode }),
    approveCashout: (requestId: string, netPaise: string, withholdingPaise: string, evidenceRef: string) => post(`/admin/cashouts/${id(requestId)}/approve`, { netPaise, withholdingPaise, evidenceRef }),
    replayInbox: (source: "auth" | "order" | "finance", eventId: string, evidenceRef: string) => post(`/admin/inbox/${source}/${id(eventId)}/replay`, { evidenceRef }),
    replayOutbox: (eventId: string, evidenceRef: string) => post(`/admin/outbox/${id(eventId)}/replay`, { evidenceRef })
  };
}
export type ReferralClient = ReturnType<typeof createReferralClient>;

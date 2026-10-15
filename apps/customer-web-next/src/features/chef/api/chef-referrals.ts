import { sessionFetch } from "@/shared/lib/session-fetch";
import {
  parseChefReferralEarnings,
  parseReferralCode,
  parseReferralEnrollment,
  parseReferralOverview,
  type ChefReferralEarnings,
  type ReferralCode,
  type ReferralEnrollStatus,
  type ReferralOverview,
} from "@/features/chef/lib/chef-referral-contract";
import { CHEF_REFERRAL_TERMS_VERSION } from "@/features/chef/lib/chef-referral-terms";

/** code is FEATURE_NOT_AVAILABLE (show Coming soon), SESSION_EXPIRED, a backend code, or REFERRAL_FAILED. */
export class ReferralError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

async function call<T>(
  path: string,
  parse: (value: unknown) => T | null,
  init: RequestInit = {},
): Promise<T> {
  const response = await sessionFetch(path, { cache: "no-store", ...init });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code =
      response.status === 401 ? "SESSION_EXPIRED" : (body as { code?: unknown } | null)?.code;
    throw new ReferralError(typeof code === "string" ? code : "REFERRAL_FAILED", response.status);
  }
  const parsed = parse(body);
  if (parsed === null) throw new ReferralError("INVALID_REFERRAL_RESPONSE", 502);
  return parsed;
}

export function fetchReferralCode(): Promise<ReferralCode> {
  return call("/api/referrals/me/code", parseReferralCode);
}

/** The Joined, On hold and Earned numbers. */
export function fetchReferralOverview(): Promise<ReferralOverview> {
  return call("/api/referrals/me", parseReferralOverview);
}

export function fetchChefReferralEarnings(): Promise<ChefReferralEarnings> {
  return call("/api/referrals/me/chef-earnings", parseChefReferralEarnings);
}

/** Joins the programme under the terms this site shows. */
export function enrollInChefReferrals(): Promise<ReferralEnrollStatus> {
  return call("/api/referrals/enroll", parseReferralEnrollment, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ termsVersion: CHEF_REFERRAL_TERMS_VERSION, termsAccepted: true }),
  });
}

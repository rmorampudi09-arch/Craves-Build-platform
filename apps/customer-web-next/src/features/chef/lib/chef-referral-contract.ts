// Mirrors referral-service MemberController (/referrals/me/code, /referrals/me/chef-earnings) and
// auth-service ReferralEnrollmentController (/auth/referrals/enroll). Browser-safe.

export type ReferralCode = { code: string; link: string };
export type ChefReferralPosting = {
  id: string;
  amountPaise: string;
  postingMonth: string;
  postedAt: string;
};
// Keeps the reply's own shape so the browser can run the same parser on what the BFF passes on.
export type ChefReferralEarnings = {
  currency: "INR";
  creditedPaise: string;
  reversedPaise: string;
  netRecordedPaise: string;
  postingMonth: string;
  monthlyCapPaise: string;
  monthUsedPaise: string;
  monthRemainingPaise: string;
  monthlyCapReached: boolean;
  recentPostings: ChefReferralPosting[];
};
export type ReferralEnrollStatus = "QUEUED" | "ALREADY_ENROLLED";

/** The referral reads answer this 403 for an account that has not joined the programme yet (or is inactive). */
export const REFERRAL_NOT_ENROLLED = "REFERRAL_ACCOUNT_NOT_ENROLLED_OR_INACTIVE";
/** The server wants a newer version of the terms than this site knows. */
export const REFERRAL_TERMS_CHANGED = "CURRENT_REFERRAL_TERMS_ACCEPTANCE_REQUIRED";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^[2-9A-HJ-NP-Z]{16}$/;
const PAISE = /^-?\d{1,13}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function paise(value: unknown, signed = false): string | null {
  return typeof value === "string" && PAISE.test(value) && (signed || !value.startsWith("-"))
    ? value
    : null;
}
function month(value: unknown): string | null {
  return typeof value === "string" && MONTH.test(value) ? value : null;
}
function instant(value: unknown): string | null {
  return typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

/** Only an https link is ever shown or shared. */
export function parseReferralCode(value: unknown): ReferralCode | null {
  const raw = record(value);
  if (
    !raw ||
    typeof raw.code !== "string" ||
    !CODE.test(raw.code) ||
    typeof raw.link !== "string" ||
    raw.link.length > 500
  )
    return null;
  try {
    if (new URL(raw.link).protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { code: raw.code, link: raw.link };
}

function parsePosting(value: unknown): ChefReferralPosting | null {
  const raw = record(value);
  if (!raw) return null;
  const id = typeof raw.id === "string" && UUID.test(raw.id) ? raw.id : null;
  const amountPaise = paise(raw.amountPaise, true),
    postingMonth = month(raw.postingMonth),
    postedAt = instant(raw.postedAt);
  return id && amountPaise && postingMonth && postedAt
    ? { id, amountPaise, postingMonth, postedAt }
    : null;
}

export function parseChefReferralEarnings(value: unknown): ChefReferralEarnings | null {
  const raw = record(value);
  if (
    !raw ||
    raw.currency !== "INR" ||
    !Array.isArray(raw.recentPostings) ||
    raw.recentPostings.length > 50
  )
    return null;
  const creditedPaise = paise(raw.creditedPaise),
    reversedPaise = paise(raw.reversedPaise),
    netRecordedPaise = paise(raw.netRecordedPaise);
  const monthlyCapPaise = paise(raw.monthlyCapPaise),
    monthUsedPaise = paise(raw.monthUsedPaise),
    monthRemainingPaise = paise(raw.monthRemainingPaise);
  const postingMonth = month(raw.postingMonth);
  const recentPostings = raw.recentPostings.map(parsePosting);
  if (
    !creditedPaise ||
    !reversedPaise ||
    !netRecordedPaise ||
    !monthlyCapPaise ||
    !monthUsedPaise ||
    !monthRemainingPaise ||
    !postingMonth
  )
    return null;
  if (recentPostings.some((posting) => !posting) || typeof raw.monthlyCapReached !== "boolean")
    return null;
  // The same sums the service keeps; a reply that disagrees with itself is not shown.
  const cap = Number(monthlyCapPaise),
    used = Number(monthUsedPaise);
  if (
    Number(creditedPaise) - Number(reversedPaise) !== Number(netRecordedPaise) ||
    used > cap ||
    cap - used !== Number(monthRemainingPaise) ||
    raw.monthlyCapReached !== used >= cap
  )
    return null;
  return {
    currency: "INR",
    creditedPaise,
    reversedPaise,
    netRecordedPaise,
    postingMonth,
    monthlyCapPaise,
    monthUsedPaise,
    monthRemainingPaise,
    monthlyCapReached: raw.monthlyCapReached,
    recentPostings: recentPostings as ChefReferralPosting[],
  };
}

export function parseReferralEnrollment(value: unknown): ReferralEnrollStatus | null {
  const raw = record(value);
  return raw?.accepted === true && (raw.status === "QUEUED" || raw.status === "ALREADY_ENROLLED")
    ? raw.status
    : null;
}

/** Referral money arrives as paise in a string; credits are small and exact, so it always shows paise: ₹450.00. */
export function referralRupees(amountPaise: string | number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(Number(amountPaise) / 100);
}

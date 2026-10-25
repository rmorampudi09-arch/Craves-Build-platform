// Mirrors referral-service MemberController (/referrals/me, /referrals/me/code, /referrals/me/chef-earnings) and
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
type ReferralLevel = 1 | 2 | 3;
/** The part of the referral overview the Joined, On hold and Earned tiles show, in the reply's own shape. */
export type ReferralOverview = {
  currency: "INR";
  pendingPaise: string;
  levels: { level: ReferralLevel; netEarnedPaise: string }[];
  downline: { level: ReferralLevel; members: string }[];
};

/** The referral reads answer this 403 for an account that has not joined the programme yet (or is inactive). */
export const REFERRAL_NOT_ENROLLED = "REFERRAL_ACCOUNT_NOT_ENROLLED_OR_INACTIVE";
/** The server wants a newer version of the terms than this site knows. */
export const REFERRAL_TERMS_CHANGED = "CURRENT_REFERRAL_TERMS_ACCEPTANCE_REQUIRED";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^[2-9A-HJ-NP-Z]{16}$/;
const PAISE = /^-?\d{1,13}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const COUNT = /^\d{1,19}$/;

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

const level = (value: unknown): ReferralLevel | null =>
  value === 1 || value === 2 || value === 3 ? value : null;

/** One earnings row for each of the three levels, and at most one member count per level. */
export function parseReferralOverview(value: unknown): ReferralOverview | null {
  const raw = record(value);
  const pendingPaise = paise(raw?.pendingPaise);
  if (
    !raw ||
    raw.currency !== "INR" ||
    !pendingPaise ||
    !Array.isArray(raw.levels) ||
    raw.levels.length !== 3 ||
    !Array.isArray(raw.downline) ||
    raw.downline.length > 3
  )
    return null;
  const levels = raw.levels.map((item) => {
    const row = record(item);
    const at = level(row?.level),
      netEarnedPaise = paise(row?.netEarnedPaise, true);
    return at && netEarnedPaise ? { level: at, netEarnedPaise } : null;
  });
  const downline = raw.downline.map((item) => {
    const row = record(item);
    const at = level(row?.level);
    return at && typeof row?.members === "string" && COUNT.test(row.members)
      ? { level: at, members: row.members }
      : null;
  });
  if (levels.some((row) => !row) || downline.some((row) => !row)) return null;
  const known = levels as ReferralOverview["levels"],
    members = downline as ReferralOverview["downline"];
  if (
    new Set(known.map((row) => row.level)).size !== known.length ||
    new Set(members.map((row) => row.level)).size !== members.length
  )
    return null;
  return { currency: "INR", pendingPaise, levels: known, downline: members };
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

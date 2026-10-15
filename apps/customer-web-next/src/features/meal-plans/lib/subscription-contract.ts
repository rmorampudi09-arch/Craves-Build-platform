export type PublicSubscriptionPlan = {
  id: string;
  planCode: string;
  name: string;
  description: string | null;
  billingPeriod: "WEEKLY" | "FORTNIGHTLY" | "MONTHLY";
  amount: number;
  currency: string;
  /** https only: the BFF resolves the server's own image path. */
  imageUrl: string | null;
};

export type CustomerSubscriptionStatus =
  | "PENDING_PAYMENT"
  | "ACTIVE"
  | "PAUSED"
  | "PAYMENT_FAILED"
  | "EXPIRED"
  | "CANCELLED";

export type CustomerSubscription = {
  id: string;
  planId: string;
  status: CustomerSubscriptionStatus;
  startDate: string;
  endDate: string | null;
  nextServiceDate: string | null;
  deliveryAddressId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** The subscription's own plan name, so a plan closed to new subscribers keeps its name. */
  planName: string | null;
  /** The bill as booked; null from an older server. */
  billingPeriod: PublicSubscriptionPlan["billingPeriod"] | null;
  amount: number | null;
  currency: string | null;
  nextBillingDate: string | null;
  /** The plan photo, as PublicSubscriptionPlan.imageUrl. */
  planImageUrl: string | null;
  /** Pause allowance per paid bill (1 weekly, 3 for 14 days, 7 monthly); null from an older server. */
  pauseDaysPerBill: number | null;
  pauseDaysLeft: number | null;
  /** While paused: the day the plan restarts by itself. */
  pauseAutoResumeDate: string | null;
  /** Refund-or-extend choices; empty on an older server and while refunds are switched off. */
  dayCredits: DayCredit[];
};

/** A declined day or paused days: a refund request or the days at the end, chosen once before the deadline. */
export type DayCredit = {
  id: string;
  kind: "DECLINE" | "PAUSE";
  firstDate: string;
  lastDate: string;
  mealSlotCode: string | null;
  days: number | null;
  status: "PENDING_CHOICE" | "EXTENDED" | "REFUND_REQUESTED" | "REFUNDED" | "REFUND_FAILED";
  /** Empty until finance prices the refund. */
  refundAmount: number | null;
  currency: string | null;
  choiceDeadline: string;
  extendAvailable: boolean;
};

export type DayCreditChoice = "REFUND" | "EXTEND";

export type CreateSubscriptionInput = {
  planId: string;
  startDate: string;
  deliveryAddressId: string | null;
  notes: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCY = /^[A-Z]{3}$/;
const PLAN_PERIODS = new Set(["WEEKLY", "FORTNIGHTLY", "MONTHLY"]);
const SUBSCRIPTION_STATUSES = new Set(["PENDING_PAYMENT", "ACTIVE", "PAUSED", "PAYMENT_FAILED", "EXPIRED", "CANCELLED"]);
const CREDIT_STATUSES = new Set(["PENDING_CHOICE", "EXTENDED", "REFUND_REQUESTED", "REFUNDED", "REFUND_FAILED"]);
const SLOT = /^[A-Z0-9][A-Z0-9_-]{0,39}$/;

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result && result.length <= max ? result : null;
}
function optionalText(value: unknown, max: number): string | null { return value === null || value === undefined || value === "" ? null : text(value, max); }
function dateOnly(value: unknown): string | null { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null; }
function instant(value: unknown): string | null { return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null; }
function count(value: unknown): number | null { return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null; }

const UPSTREAM_IMAGE = /^\/api\/v1\/subscriptions\/plans\/([0-9a-f-]{36})\/image\?v=(\d{1,15})$/i;
const OWN_IMAGE = /^\/api\/subscriptions\/plans\/([0-9a-f-]{36})\/image\?v=\d{1,15}$/i;

/** Our image route for the server's own photo path (the browser never calls the API origin), an https URL as is, anything else dropped. */
function planImageUrl(value: unknown): string | null {
  const raw = text(value, 2000);
  if (!raw) return null;
  const upstream = UPSTREAM_IMAGE.exec(raw);
  if (upstream) return UUID.test(upstream[1]) ? `/api/subscriptions/plans/${upstream[1].toLowerCase()}/image?v=${upstream[2]}` : null;
  const own = OWN_IMAGE.exec(raw);
  if (own) return UUID.test(own[1]) ? raw : null;
  return /^https:\/\/[^\s"'<>]+$/.test(raw) ? raw : null;
}

export function indiaBusinessDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function parsePublicSubscriptionPlan(value: unknown): PublicSubscriptionPlan | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = text(raw.id, 64); const planCode = text(raw.planCode, 80); const name = text(raw.name, 160);
  const billingPeriod = text(raw.billingPeriod, 20); const amount = typeof raw.amount === "number" ? raw.amount : Number(raw.amount);
  const currency = text(raw.currency, 3)?.toUpperCase() ?? null;
  if (!id || !UUID.test(id) || !planCode || !name || !billingPeriod || !PLAN_PERIODS.has(billingPeriod) || !Number.isFinite(amount) || amount < 0 || !currency || !CURRENCY.test(currency)) return null;
  return { id, planCode, name, description: optionalText(raw.description, 2000), billingPeriod: billingPeriod as PublicSubscriptionPlan["billingPeriod"], amount, currency, imageUrl: planImageUrl(raw.imageUrl) };
}
export function parsePublicSubscriptionPlans(value: unknown): PublicSubscriptionPlan[] | null {
  if (!Array.isArray(value) || value.length > 500) return null;
  // One plan the web can't read is left out; it must never hide every other plan.
  return value.map(item => parsePublicSubscriptionPlan(item)).filter(plan => plan !== null);
}

export function parseDayCredit(value: unknown): DayCredit | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const firstDate = dateOnly(raw.firstDate); const lastDate = dateOnly(raw.lastDate); const choiceDeadline = instant(raw.choiceDeadline);
  const days = raw.days == null ? null : Number.isInteger(raw.days) && Number(raw.days) > 0 && Number(raw.days) <= 366 ? Number(raw.days) : undefined;
  const refundAmount = raw.refundAmount == null ? null : typeof raw.refundAmount === "number" || typeof raw.refundAmount === "string" ? Number(raw.refundAmount) : NaN;
  const currency = raw.currency == null ? null : text(raw.currency, 3);
  const mealSlotCode = raw.mealSlotCode == null ? null : typeof raw.mealSlotCode === "string" && SLOT.test(raw.mealSlotCode) ? raw.mealSlotCode : undefined;
  if (typeof raw.id !== "string" || !UUID.test(raw.id) || (raw.kind !== "DECLINE" && raw.kind !== "PAUSE") || !firstDate || !lastDate || lastDate < firstDate
    || typeof raw.status !== "string" || !CREDIT_STATUSES.has(raw.status) || !choiceDeadline || typeof raw.extendAvailable !== "boolean" || days === undefined
    || mealSlotCode === undefined || (refundAmount !== null && (!Number.isFinite(refundAmount) || refundAmount < 0)) || (currency !== null && !CURRENCY.test(currency))) return null;
  return { id: raw.id, kind: raw.kind, firstDate, lastDate, mealSlotCode, days, status: raw.status as DayCredit["status"], refundAmount, currency, choiceDeadline, extendAvailable: raw.extendAvailable };
}

export function parseDayCreditChoice(value: unknown): { choice: DayCreditChoice } | null {
  if (!value || typeof value !== "object" || Object.keys(value).length !== 1) return null;
  const { choice } = value as { choice?: unknown };
  return choice === "REFUND" || choice === "EXTEND" ? { choice } : null;
}

export function parseCustomerSubscription(value: unknown): CustomerSubscription | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = text(raw.id, 64); const planId = text(raw.planId, 64); const status = text(raw.status, 40);
  const startDate = dateOnly(raw.startDate); const createdAt = instant(raw.createdAt); const updatedAt = instant(raw.updatedAt);
  const deliveryAddressId = optionalText(raw.deliveryAddressId, 64);
  if (!id || !UUID.test(id) || !planId || !UUID.test(planId) || !status || !SUBSCRIPTION_STATUSES.has(status) || !startDate || !createdAt || !updatedAt || (deliveryAddressId && !UUID.test(deliveryAddressId))) return null;
  // The bill fields only add the price line, so an unreadable one is left out rather than failing the plan.
  const billingPeriod = typeof raw.billingPeriod === "string" && PLAN_PERIODS.has(raw.billingPeriod) ? raw.billingPeriod as PublicSubscriptionPlan["billingPeriod"] : null;
  const amount = typeof raw.amount === "number" ? raw.amount : typeof raw.amount === "string" && raw.amount.trim() ? Number(raw.amount) : NaN;
  const currency = typeof raw.currency === "string" && CURRENCY.test(raw.currency) ? raw.currency : null;
  return { id, planId, status: status as CustomerSubscriptionStatus, startDate, endDate: raw.endDate == null ? null : dateOnly(raw.endDate), nextServiceDate: raw.nextServiceDate == null ? null : dateOnly(raw.nextServiceDate), deliveryAddressId, notes: optionalText(raw.notes, 2000), createdAt, updatedAt, planName: optionalText(raw.planName, 160),
    billingPeriod, amount: Number.isFinite(amount) && amount >= 0 ? amount : null, currency, nextBillingDate: raw.nextBillingDate == null ? null : dateOnly(raw.nextBillingDate),
    planImageUrl: planImageUrl(raw.planImageUrl),
    pauseDaysPerBill: count(raw.pauseDaysPerBill), pauseDaysLeft: count(raw.pauseDaysLeft), pauseAutoResumeDate: raw.pauseAutoResumeDate == null ? null : dateOnly(raw.pauseAutoResumeDate),
    // A choice the web can't read is left out; the server still settles it at the deadline.
    dayCredits: Array.isArray(raw.dayCredits) ? raw.dayCredits.slice(0, 100).map(parseDayCredit).filter(credit => credit !== null) : [] };
}
export function parseCustomerSubscriptions(value: unknown): CustomerSubscription[] | null {
  if (!Array.isArray(value) || value.length > 500) return null;
  const parsed = value.map(parseCustomerSubscription); return parsed.some(item => item === null) ? null : parsed as CustomerSubscription[];
}

export function parseCreateSubscriptionInput(value: unknown): CreateSubscriptionInput | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const planId = text(raw.planId, 64); const startDate = dateOnly(raw.startDate); const deliveryAddressId = optionalText(raw.deliveryAddressId, 64);
  if (!planId || !UUID.test(planId) || !startDate || (deliveryAddressId && !UUID.test(deliveryAddressId))) return null;
  if (startDate < indiaBusinessDate()) return null;
  return { planId, startDate, deliveryAddressId, notes: optionalText(raw.notes, 2000) };
}

export function parseSubscriptionReason(value: unknown): { reason: string | null } | null {
  if (value === null || value === undefined) return { reason: null };
  if (typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const reason = optionalText(raw.reason, 1000);
  return raw.reason && !reason ? null : { reason };
}

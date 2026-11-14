import { z } from "zod";

/** What the Finance screens read from integration-service (FinanceInsightsController). Amounts are rupee strings. */
const id = z.string().uuid();
const money = z.string().regex(/^-?\d{1,14}\.\d{2}$/);
const at = z.string().datetime({ offset: true });
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const count = z.number().int().nonnegative();
const code = z.string().regex(/^[A-Z][A-Z0-9_]{0,59}$/);
const text = (max: number) => z.string().max(max);

export const KINDS = ["CUSTOMER_PAYMENT", "REFUND", "CHEF_EARNING", "CHEF_PAYOUT", "RIDER_PAYOUT"] as const;
export type Kind = typeof KINDS[number];

const positionSchema = z.object({ readyToPay: money, onHold: money, notYetDue: money, inProgress: money, chefsToPay: count, chefsOnHold: count });
export const overviewSchema = z.object({
  from: day, to: day, generatedAt: at,
  totals: z.object({ customerPaid: money, customerPayments: count, refunded: money, refunds: count, chefEarned: money, chefOrders: count,
    chefPaid: money, chefPayouts: count, riderPaid: money, riderPayouts: count }),
  days: z.array(z.object({ day, customerPaid: money, refunded: money, chefEarned: money, chefPaid: money, riderPaid: money })).max(367),
  split: z.object({ delivered: money, chefs: money, cravesFees: money, deliveryCharges: money, gst: money, tdsHeld: money, other: money }),
  position: positionSchema,
  attention: z.object({ payoutsToConfirm: count, payoutsFailed: count, refundsStuck: count, ordersToReview: count, riderPayoutsOpen: count }),
  recording: z.object({ on: z.boolean(), paymentsRecorded: count, earningsRecorded: count, lastEarningAt: at.nullable(), payoutMode: z.enum(["CRAVES_MANUAL", "RAZORPAYX"]) }),
});
export type Overview = z.infer<typeof overviewSchema>;

export const movementSchema = z.object({
  kind: z.enum(KINDS), id, at, amount: money, status: code, reference: text(200).nullable(), channel: text(40).nullable(),
  providerReference: text(200).nullable(), partyType: z.enum(["CUSTOMER", "CHEF", "RIDER"]), partyId: id.nullable(), partyName: text(160).nullable(),
  checkoutId: id.nullable(), chefOrderId: id.nullable(),
});
export type Movement = z.infer<typeof movementSchema>;
export const movementPageSchema = z.object({
  items: z.array(movementSchema).max(100), nextCursor: text(120).nullable(),
  summary: z.array(z.object({ kind: z.enum(KINDS), count, amount: money })).max(KINDS.length),
});
export type MovementPage = z.infer<typeof movementPageSchema>;

export const chefBalancesSchema = z.object({
  generatedAt: at, payoutMode: z.enum(["CRAVES_MANUAL", "RAZORPAYX"]), position: positionSchema,
  chefs: z.array(z.object({ chefId: id, orders: count, due: money, notYetDue: money, inProgress: money, paid: money,
    lastPaidAt: at.nullable(), onHold: z.boolean(), holdReason: text(1000).nullable() })).max(2000),
});
export type ChefBalances = z.infer<typeof chefBalancesSchema>;
export type ChefBalance = ChefBalances["chefs"][number];

const journalSchema = z.array(z.object({ id, eventType: code, occurredAt: at, evidence: text(500),
  lines: z.array(z.object({ account: code, debit: money, credit: money })).max(500) })).max(200);
const splitSchema = z.object({ customerTotal: money, customerFood: money, delivery: money, platformFee: money, foodGst: money, deliveryGst: money,
  platformGst: money, chefGross: money, chefServiceFee: money, chefFeeGst: money, withholding: money, chefPayable: money });
const payoutRefSchema = z.object({ id, amount: money, status: code, mode: code, channel: code, reference: text(160).nullable(), createdAt: at, paidAt: at.nullable() });
export const orderTrailSchema = z.object({
  checkoutId: id, customerId: id.nullable(),
  payments: z.array(z.object({ id, reference: text(80), provider: code, providerOrderId: text(160).nullable(), providerPaymentId: text(160).nullable(),
    amount: money, status: code, providerStatus: text(80).nullable(), createdAt: at, updatedAt: at, recordedAt: at.nullable() })).max(50),
  orders: z.array(z.object({ chefOrderId: id, chefId: id.nullable(), kitchenId: id.nullable(), split: splitSchema.nullable(), state: code.nullable(),
    lastResult: text(160).nullable(), deliveredAt: at.nullable(), earningRecordedAt: at.nullable(), payAvailableAt: at.nullable(),
    payout: payoutRefSchema.nullable(),
    delivery: z.object({ orderCode: text(40), kitchenName: text(200), riderName: text(160).nullable(), riderPay: money.nullable(), state: code }).nullable() })).max(50),
  refunds: z.array(z.object({ id, reference: text(120), chefOrderId: id.nullable(), amount: money, status: code, providerStatus: text(40).nullable(),
    providerRefundId: text(160).nullable(), reason: text(255).nullable(), requestedAt: at, processedAt: at.nullable() })).max(100),
  journal: journalSchema,
});
export type OrderTrail = z.infer<typeof orderTrailSchema>;
export type ChefOrder = OrderTrail["orders"][number];

export const payoutTrailSchema = z.object({
  payout: z.object({ id, chefId: id, amount: money, status: code, mode: code, channel: code, providerId: text(80).nullable(),
    providerStatus: text(40).nullable(), reference: text(160).nullable(), destinationReference: text(240).nullable(), lastError: text(160).nullable(),
    createdAt: at, authorizedAt: at.nullable(), paidAt: at.nullable(), updatedAt: at }),
  orders: z.array(z.object({ chefOrderId: id, checkoutId: id.nullable(), amount: money, deliveredAt: at, counted: z.boolean() })).max(5000),
  referralRewards: money,
  events: z.array(z.object({ at, action: code, actor: text(120), evidence: text(500) })).max(500),
  journal: journalSchema,
});
export type PayoutTrail = z.infer<typeof payoutTrailSchema>;

/** The one browser-facing read: /api/admin/finance/insights?view=…. Anything else is refused before it reaches the backend. */
const querySchema = z.discriminatedUnion("view", [
  z.object({ view: z.literal("overview"), from: day.optional(), to: day.optional() }).strict(),
  z.object({ view: z.literal("transactions"), from: day.optional(), to: day.optional(), kind: z.enum(KINDS).optional(), status: code.optional(),
    party: id.optional(), search: z.string().trim().regex(/^[A-Za-z0-9_-]{3,80}$/).optional(), cursor: z.string().regex(/^[0-9TZ:.\-]{20,40}_[0-9a-f-]{36}$/).optional(),
    limit: z.enum(["25", "50", "100"]).optional() }).strict(),
  z.object({ view: z.literal("order"), id }).strict(),
  z.object({ view: z.literal("payout"), id }).strict(),
  z.object({ view: z.literal("chefs") }).strict(),
]);
const SCHEMAS = { overview: overviewSchema, transactions: movementPageSchema, order: orderTrailSchema, payout: payoutTrailSchema, chefs: chefBalancesSchema };

export function insightsRequest(params: URLSearchParams): { path: string; schema: z.ZodTypeAny } | null {
  if (new Set(params.keys()).size !== [...params.keys()].length) return null;
  const query = querySchema.safeParse(Object.fromEntries(params));
  if (!query.success) return null;
  const { view, ...rest } = query.data;
  const base = "/admin/finance/insights/";
  if (view === "order" || view === "payout") return { path: `${base}${view}s/${(rest as { id: string }).id}`, schema: SCHEMAS[view] };
  const search = new URLSearchParams(rest as Record<string, string>).toString();
  return { path: `${base}${view}${search ? `?${search}` : ""}`, schema: SCHEMAS[view] };
}

export const TABS = ["overview", "transactions", "payouts", "settings"] as const;
export type Tab = typeof TABS[number];
/** What a shared /admin/finance link may carry: the tab, the period and one reference to look for. Nothing else is read. */
export function initialView(params: Record<string, string | string[] | undefined>): { tab: Tab; from: string; to: string; search: string } {
  const one = (name: string) => typeof params[name] === "string" ? params[name] as string : "";
  const tab = TABS.find(value => value === one("tab")) ?? "overview";
  const from = day.safeParse(one("from")).success ? one("from") : "", to = day.safeParse(one("to")).success ? one("to") : "";
  const search = /^[A-Za-z0-9_-]{3,80}$/.test(one("q")) ? one("q") : "";
  return { tab: search ? "transactions" : tab, from: from && to && from <= to ? from : "", to: from && to && from <= to ? to : "", search };
}

// ---- Wording and formatting shared by the screens -------------------------------------------------------------------

export const KIND_LABEL: Record<Kind, string> = { CUSTOMER_PAYMENT: "Customer payment", REFUND: "Refund", CHEF_EARNING: "Chef earning",
  CHEF_PAYOUT: "Chef payout", RIDER_PAYOUT: "Rider payout" };
/** The one status in which each kind's money has really moved. A chef earning is a debt, so it never moves money. */
const SETTLED: Partial<Record<Kind, string>> = { CUSTOMER_PAYMENT: "PAID", REFUND: "SUCCESS", CHEF_PAYOUT: "PAID", RIDER_PAYOUT: "PAID" };
/** Plus for money that reached Craves, minus for money that left. A failed or unfinished row moved nothing, so it has no sign. */
export const flowSign = (row: Pick<Movement, "kind" | "status">): "" | "+" | "-" =>
  SETTLED[row.kind] !== row.status ? "" : row.kind === "CUSTOMER_PAYMENT" ? "+" : "-";

export type Tone = "success" | "warning" | "danger" | "neutral";
const STATUS: Record<Kind, Record<string, [string, Tone]>> = {
  CUSTOMER_PAYMENT: { CREATED: ["Started", "neutral"], PAYMENT_PENDING: ["Waiting for payment", "warning"], PAID: ["Paid", "success"],
    FAILED: ["Failed", "danger"], CANCELLED: ["Cancelled", "neutral"] },
  REFUND: { REQUESTED: ["Refund in progress", "warning"], PROCESSING: ["Refund in progress", "warning"], RETRY: ["Refund in progress", "warning"],
    PENDING: ["Refund in progress", "warning"], BENEFITS_PENDING: ["Refund in progress", "warning"], ONHOLD: ["On hold", "warning"],
    SUCCESS: ["Refunded", "success"], FAILED: ["Refund failed", "danger"], CANCELLED: ["Cancelled", "neutral"], DEAD_LETTER: ["Stuck, needs a look", "danger"] },
  CHEF_EARNING: { RECORDED: ["Earned", "success"] },
  CHEF_PAYOUT: { RESERVED: ["Set aside, not sent yet", "warning"], SUBMITTING: ["Being sent", "warning"], PROCESSING: ["With the bank", "warning"],
    UNKNOWN: ["Outcome not known", "danger"], PAID: ["Paid", "success"], FAILED: ["Failed", "danger"], REVERSED: ["Returned by the bank", "danger"],
    REVIEW_REQUIRED: ["Needs a check", "danger"], CANCELLED: ["Cancelled", "neutral"] },
  RIDER_PAYOUT: { PENDING: ["To be paid", "warning"], PAID: ["Paid", "success"], FAILED: ["Failed", "danger"] },
};
export function statusOf(kind: Kind, status: string): { label: string; tone: Tone } {
  const known = STATUS[kind][status];
  return known ? { label: known[0], tone: known[1] } : { label: status.toLowerCase().replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase()), tone: "neutral" };
}
export const statusesOf = (kind: Kind) => Object.keys(STATUS[kind]);

export const isZero = (amount: string) => /^-?0+\.00$/.test(amount);
/** Rupees with Indian grouping, from the exact string: 184300.50 → ₹1,84,300.50. Never through a float. Zero carries no sign. */
export function rupees(amount: string, sign: "" | "+" | "-" = ""): string {
  const [whole, paise = "00"] = amount.replace("-", "").split(".");
  const head = whole.length > 3 ? whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," : "";
  const mark = isZero(amount) ? "" : amount.startsWith("-") ? "-" : sign;
  return `${mark === "-" ? "−" : mark}₹${head}${whole.slice(-3)}.${paise}`;
}
/** Exact paise, for sums and shares shown on screen (never sent back as an amount). */
export const paise = (amount: string) => BigInt(amount.replace(".", ""));
export function fromPaise(value: bigint): string {
  const digits = (value < 0n ? -value : value).toString().padStart(3, "0");
  return `${value < 0n ? "-" : ""}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}
export const shortId = (value: string) => value.slice(0, 8).toUpperCase();
/** The order number customers, chefs and riders quote: # and the first 8 characters of the kitchen's order ID (as shortOrderNumber). */
export const orderNumber = (chefOrderId: string) => `#${shortId(chefOrderId)}`;

/** One bar per day up to two months; longer periods are added up by week, then by month, so bars never become slivers. */
export type Bucket = { from: string; to: string; label: string; moneyIn: bigint; refunded: bigint; chefPaid: bigint; riderPaid: bigint };
export const dayLabel = (value: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
export function bucketDays(days: Overview["days"]): Bucket[] {
  const size = days.length <= 62 ? "day" : days.length <= 190 ? "week" : "month";
  const key = (value: string) => {
    if (size === "day") return value;
    if (size === "month") return value.slice(0, 7);
    const date = new Date(`${value}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7)); // the Monday of that week
    return date.toISOString().slice(0, 10);
  };
  const label = (value: string) => size === "month"
    ? new Intl.DateTimeFormat("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)) : dayLabel(value);
  const buckets: (Bucket & { key: string })[] = [];
  for (const row of days) {
    let last = buckets.at(-1);
    if (!last || last.key !== key(row.day)) { last = { key: key(row.day), from: row.day, to: row.day, label: label(row.day), moneyIn: 0n, refunded: 0n, chefPaid: 0n, riderPaid: 0n }; buckets.push(last); }
    last.to = row.day; last.moneyIn += paise(row.customerPaid); last.refunded += paise(row.refunded); last.chefPaid += paise(row.chefPaid); last.riderPaid += paise(row.riderPaid);
  }
  return buckets;
}

/** A round axis top at or above the largest value: 1, 2 or 5 times a power of ten, in paise. */
export function niceCeiling(value: bigint): bigint {
  if (value <= 0n) return 0n;
  let unit = 100n; // one rupee
  while (unit * 10n < value) unit *= 10n;
  for (const step of [1n, 2n, 5n, 10n]) if (unit * step >= value) return unit * step;
  return unit * 10n;
}
export const compactRupees = (value: bigint) => `₹${new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value / 100n))}`;

export function movementsCsv(rows: Movement[], name: (row: Movement) => string): string {
  // A leading = + - @ would run as a formula in a spreadsheet.
  const cell = (value: string) => `"${(/^[=+\-@\t\r]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
  const lines = rows.map(row => [row.at, KIND_LABEL[row.kind], name(row), row.amount, statusOf(row.kind, row.status).label, row.reference ?? "",
    row.providerReference ?? "", row.chefOrderId ? orderNumber(row.chefOrderId) : "", row.checkoutId ?? "", row.id].map(cell).join(","));
  return ["time_utc,type,who,amount_inr,status,reference,provider_reference,order_number,checkout_id,record_id", ...lines].join("\r\n");
}

/** Why a delivered order's earning is not recorded yet, in the finalizer's own words made plain. */
export function earningWait(order: ChefOrder): string {
  switch (order.lastResult) {
    case "WAITING_VERIFIED_CAPTURE": return "Waiting for the customer's payment to be confirmed.";
    case "CAPTURED_AWAITING_DELIVERY": return "Paid. The chef earns this when the order is delivered.";
    case "REFUND_RESERVATION_EXISTS": return "A refund is open on this order, so the earning is held for a check.";
    case "INELIGIBLE_SOURCE_STATE": return "This order was cancelled, so nothing was earned.";
    default:
      if (order.state === "REVIEW_REQUIRED") return "The order's records disagree, so the earning is held for a check.";
      if (order.state === "CANCELLED") return "This order was cancelled, so nothing was earned.";
      return order.state === null ? "Earnings were not being recorded when this order was placed." : "Not recorded yet.";
  }
}

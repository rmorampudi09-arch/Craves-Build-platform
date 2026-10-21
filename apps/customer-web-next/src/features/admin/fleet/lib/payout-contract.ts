import { z } from "zod";
import { day, id, instant, personName, reasonBody, reasonText, type FleetRoute } from "./fleet-common";

const paise = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const payoutSchema = z.object({
  payoutId: id, riderId: id, riderName: personName, amountPaise: paise, maskedAccount: z.string().max(80),
  status: z.enum(["PENDING", "PAID", "FAILED"]), utr: z.string().max(22).nullable(), failureReason: z.string().max(1000).nullable(),
  markedBy: personName.nullable(), markedAt: instant.nullable(),
});
export const payoutBatchSummarySchema = z.object({
  batchId: id, kind: z.enum(["WEEKLY", "DAILY_WITHDRAWAL"]), payoutDate: day, status: z.enum(["CREATED", "APPROVED", "SENT", "CLOSED"]),
  totalPaise: paise, payoutCount: z.number().int().nonnegative(), createdBy: personName, createdByMe: z.boolean(), createdAt: instant,
  approvedBy: personName.nullable(), approvedAt: instant.nullable(), sentAt: instant.nullable(),
});
export const payoutBatchSchema = payoutBatchSummarySchema.extend({ payouts: z.array(payoutSchema).max(5000) });
export const batchesSchema = z.object({ batches: z.array(payoutBatchSummarySchema).max(100) });
export const holdSchema = z.object({
  holdId: id, tripId: id, orderCode: z.string().regex(/^#[0-9A-F]{8}$/), riderId: id, riderName: personName, amountPaise: paise,
  reason: z.string().max(1000), releaseOn: day, state: z.enum(["ACTIVE", "RELEASED"]), createdBy: personName, createdAt: instant,
  releasedBy: personName.nullable(), releasedAt: instant.nullable(),
});
export const holdsSchema = z.object({ holds: z.array(holdSchema).max(500) });

export const createBatchSchema = z.object({ kind: z.enum(["WEEKLY", "DAILY_WITHDRAWAL"]), payoutDate: day })
  .refine(value => value.kind !== "WEEKLY" || new Date(`${value.payoutDate}T00:00:00Z`).getUTCDay() === 1, { message: "A weekly payout date must be a Monday." });
export const utrSchema = z.object({ utr: z.string().trim().regex(/^[A-Za-z0-9]{12,22}$/, "Enter the UTR from the bank: 12 to 22 letters or digits.") });
export const createHoldSchema = z.object({ tripId: id, reason: reasonText, releaseOn: day });

export type PayoutBatchSummary = z.infer<typeof payoutBatchSummarySchema>;
export type PayoutBatch = z.infer<typeof payoutBatchSchema>;
export type Payout = z.infer<typeof payoutSchema>;
export type Hold = z.infer<typeof holdSchema>;

/** Integer paise as rupees with Indian digit grouping: 12345678 → ₹1,23,456.78. */
export function formatPaise(value: number): string {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  return `${sign}₹${Math.floor(absolute / 100).toLocaleString("en-IN")}.${String(absolute % 100).padStart(2, "0")}`;
}

/** Integer paise as a plain rupee amount for CSV: 12345678 → 123456.78. */
export const paiseToRupees = (value: number) => `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;

export const istDay = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
export function addDays(dayText: string, days: number): string {
  const date = new Date(`${dayText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** A hold covers one trip's pay and never lasts more than 7 days. */
export function releaseOnProblem(releaseOn: string, now = new Date()): string | null {
  const today = istDay(now);
  const last = addDays(today, 7);
  return /^\d{4}-\d{2}-\d{2}$/.test(releaseOn) && releaseOn >= today && releaseOn <= last
    ? null : `Pick a release date from today to ${last}: a hold never lasts more than 7 days.`;
}

/** CSV for spreadsheets: every cell quoted, and cells that start like a formula are made plain text. */
export function toCsv(rows: readonly (readonly (string | number | null)[])[]): string {
  const cell = (value: string | number | null) => {
    const text = value === null ? "" : String(value);
    return `"${(/^[=+\-@\t\r]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
  };
  return rows.map(row => row.map(cell).join(",")).join("\r\n");
}

export const PAYOUT_ROUTES: readonly FleetRoute[] = [
  { method: "GET", path: "payout-batches", response: batchesSchema },
  { method: "POST", path: "payout-batches", body: createBatchSchema, response: payoutBatchSchema },
  { method: "GET", path: "payout-batches/:id", response: payoutBatchSchema },
  { method: "GET", path: "payout-batches/:id/file",
    file: { types: ["text/csv"], maxBytes: 2 * 1024 * 1024, attachment: ids => `rider-payouts-${ids[0]}.csv` } },
  { method: "POST", path: "payout-batches/:id/approve", response: payoutBatchSchema },
  { method: "POST", path: "payout-batches/:id/mark-sent", response: payoutBatchSchema },
  { method: "POST", path: "payout-batches/:id/payouts/:id/utr", body: utrSchema, response: payoutSchema },
  { method: "POST", path: "payout-batches/:id/payouts/:id/fail", body: reasonBody, response: payoutSchema },
  { method: "GET", path: "holds", response: holdsSchema, query: { state: z.enum(["ACTIVE", "RELEASED"]) } },
  { method: "POST", path: "holds", body: createHoldSchema, response: holdSchema },
  { method: "POST", path: "holds/:id/release", response: holdSchema },
];

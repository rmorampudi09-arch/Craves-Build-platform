import { describe, expect, it } from "vitest";
import {
  addDays, adjustmentRequest, cancelBatchSchema, cancelledBatchSchema, createBatchSchema, formatPaise, holdsSchema, istDay, paiseToRupees,
  payAdjustmentSchema, payoutBatchSchema, releaseOnProblem, toCsv, utrSchema, type AdjustmentForm,
} from "./payout-contract";

const BATCH = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const at = "2026-10-20T06:30:00Z";
const payout = { payoutId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", riderId: "11111111-1111-4111-8111-111111111111", riderName: "Ravi Kumar", amountPaise: 123456, maskedAccount: "xxxxxx4321", status: "PENDING", utr: null, failureReason: null, markedBy: null, markedAt: null };
const batch = { batchId: BATCH, kind: "WEEKLY", payoutDate: "2026-10-19", status: "CREATED", totalPaise: 123456, payoutCount: 1, createdBy: "Asha", createdByMe: true, createdAt: at, approvedBy: null, approvedAt: null, sentAt: null, payouts: [payout] };

describe("money", () => {
  it("formats integer paise with Indian grouping", () => {
    expect(formatPaise(0)).toBe("₹0.00");
    expect(formatPaise(5)).toBe("₹0.05");
    expect(formatPaise(8000)).toBe("₹80.00");
    expect(formatPaise(12345678)).toBe("₹1,23,456.78");
    expect(formatPaise(1_000_000_000)).toBe("₹1,00,00,000.00");
    expect(formatPaise(-4550)).toBe("-₹45.50");
    expect(paiseToRupees(12345678)).toBe("123456.78");
  });
});

describe("payout parsers", () => {
  it("accept a batch and drop unknown fields such as full account numbers", () => {
    const parsed = payoutBatchSchema.parse({ ...batch, fileUrl: "https://bank.example", payouts: [{ ...payout, accountNumber: "123456784321", ifsc: "SBIN0001234" }] });
    expect(parsed).not.toHaveProperty("fileUrl");
    expect(parsed.payouts[0]).toEqual(payout);
  });

  it("refuse rupee decimals, negative amounts and unknown states", () => {
    expect(payoutBatchSchema.safeParse({ ...batch, totalPaise: 1234.56 }).success).toBe(false);
    expect(payoutBatchSchema.safeParse({ ...batch, payouts: [{ ...payout, amountPaise: -1 }] }).success).toBe(false);
    expect(payoutBatchSchema.safeParse({ ...batch, status: "PAID" }).success).toBe(false);
    expect(payoutBatchSchema.safeParse({ ...batch, createdByMe: undefined }).success).toBe(false);
    expect(holdsSchema.safeParse({ holds: [{ holdId: BATCH, tripId: BATCH, orderCode: "#0BDE0107", riderId: BATCH, riderName: "Ravi", amountPaise: 9000, reason: "Photo delivery", releaseOn: "2026-10-25", state: "FROZEN", createdBy: "Asha", createdAt: at, releasedBy: null, releasedAt: null }] }).success).toBe(false);
  });
});

describe("payout rules", () => {
  it("pays the weekly file on a Monday", () => {
    expect(createBatchSchema.safeParse({ kind: "WEEKLY", payoutDate: "2026-10-19" }).success).toBe(true);
    expect(createBatchSchema.safeParse({ kind: "WEEKLY", payoutDate: "2026-10-20" }).error?.issues[0]?.message).toBe("A weekly payout date must be a Monday.");
    expect(createBatchSchema.safeParse({ kind: "DAILY_WITHDRAWAL", payoutDate: "2026-10-20" }).success).toBe(true);
  });

  it("accepts a bank UTR only", () => {
    expect(utrSchema.safeParse({ utr: "429312345678" }).success).toBe(true);
    expect(utrSchema.safeParse({ utr: "SBIN426012345678" }).success).toBe(true);
    expect(utrSchema.safeParse({ utr: "12345" }).error?.issues[0]?.message).toBe("Enter the UTR from the bank: 12 to 22 letters or digits.");
    expect(utrSchema.safeParse({ utr: "4293-1234-5678" }).success).toBe(false);
  });

  it("keeps a hold to today through 7 days ahead in IST", () => {
    const now = new Date("2026-10-20T20:00:00Z"); // 21 Oct 01:30 IST
    expect(istDay(now)).toBe("2026-10-21");
    expect(releaseOnProblem("2026-10-21", now)).toBeNull();
    expect(releaseOnProblem("2026-10-28", now)).toBeNull();
    expect(releaseOnProblem("2026-10-29", now)).toBe("Pick a release date from today to 2026-10-28: a hold never lasts more than 7 days.");
    expect(releaseOnProblem("2026-10-20", now)).not.toBeNull();
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
  });
});

describe("corrections", () => {
  const TRIP = "77777777-7777-4777-8777-777777777777";
  const form: AdjustmentForm = { tripId: ` ${TRIP} `, component: "drop-km", direction: "TAKE_BACK", rupees: "12.5", reason: "The drop was 2.9 km, not 4.2 km" };

  it("turns the adjust-pay form into a signed amount in paise for one pay line", () => {
    expect(adjustmentRequest(form)).toEqual({ tripId: TRIP, body: { component: "drop-km", amountPaise: -1250, reason: "The drop was 2.9 km, not 4.2 km" } });
    expect(adjustmentRequest({ ...form, direction: "PAY", rupees: "40" })).toMatchObject({ body: { amountPaise: 4000 } });
    expect(adjustmentRequest({ ...form, tripId: "trip-1" })).toBe("Paste the trip ID: it is on the rider's recent offers and on the support issue.");
    for (const rupees of ["", "0", "0.00", "-12", "12.505", "₹12"]) expect(adjustmentRequest({ ...form, rupees })).toBe("Enter the amount in rupees, like 12 or 12.50.");
    expect(adjustmentRequest({ ...form, rupees: "10000.01" })).toBe("At most ₹10,000 either way.");
    expect(adjustmentRequest({ ...form, rupees: "10000" })).toMatchObject({ body: { amountPaise: -1_000_000 } });
    expect(adjustmentRequest({ ...form, reason: " x " })).toBe("Write a reason of at least 3 characters.");
    expect(typeof adjustmentRequest({ ...form, component: "tds" as AdjustmentForm["component"] })).toBe("string");
  });

  it("reads the adjustment and the cancelled file the server returns", () => {
    const adjustment = { tripId: TRIP, orderCode: "#0BDE0107", riderId: TRIP, component: "drop-km", revision: 2, amountPaise: -1250, reason: "Shorter drop" };
    expect(payAdjustmentSchema.parse(adjustment)).toEqual(adjustment);
    expect(payAdjustmentSchema.safeParse({ ...adjustment, revision: 1 }).success).toBe(false);
    expect(cancelledBatchSchema.parse({ batchId: BATCH, kind: "WEEKLY", payoutDate: "2026-10-19", payoutCount: 2, totalPaise: 13100 }).payoutCount).toBe(2);
  });

  it("cancels a file only with a reason and the not-uploaded check", () => {
    expect(cancelBatchSchema.safeParse({ reason: "Wrong Monday", notUploaded: true }).success).toBe(true);
    expect(cancelBatchSchema.safeParse({ reason: "Wrong Monday", notUploaded: false }).error?.issues[0]?.message)
      .toBe("Tick the box once you have checked this file was not uploaded to the bank.");
    expect(cancelBatchSchema.safeParse({ reason: "", notUploaded: true }).success).toBe(false);
  });
});

it("writes CSV cells that a spreadsheet cannot run", () => {
  expect(toCsv([["name", "note"], ["Ravi \"RK\" Kumar", "=HYPERLINK(\"x\")"], ["Sita", null]])).toBe(
    "\"name\",\"note\"\r\n\"Ravi \"\"RK\"\" Kumar\",\"'=HYPERLINK(\"\"x\"\")\"\r\n\"Sita\",\"\"",
  );
});

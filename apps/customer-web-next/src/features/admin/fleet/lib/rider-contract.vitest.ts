import { describe, expect, it } from "vitest";
import {
  approveDocumentSchema, expiryProblem, payoutAccountInputSchema, riderDetailSchema, riderDocumentSchema, riderPageSchema, riderVehicleInputSchema, riderVehicleSchema,
  statusEventProblem, type StatusEventInput,
} from "./rider-contract";

const RIDER = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";
const at = "2026-10-20T06:30:00Z";
const riderDetail = {
  rider: { riderId: RIDER, name: "Ravi Kumar", phoneMasked: "+91 98xxxxx210", status: "PENDING", pendingDocuments: 1, pendingDevice: true, createdAt: at, kycName: "RAVI KUMAR", language: "te", vehicleNumberMasked: "TS09xx1234" },
  documents: [{ documentId: DOC, type: "DRIVING_LICENCE", status: "PENDING", expiresOn: "2030-01-31", reason: null, reviewedBy: null, reviewedAt: null, uploadedAt: at }],
  devices: [{ deviceId: "33333333-3333-4333-8333-333333333333", model: "Redmi 13C", appVersion: "1.0.0", state: "PENDING_APPROVAL", firstSeenAt: at, approvedBy: null, approvedAt: null }],
  payoutAccount: { method: "UPI", maskedAccount: "ra***@okaxis", ifsc: null, holderName: "RAVI KUMAR", setBy: "Asha (ops)", setAt: at },
  shifts: [{ shiftId: "44444444-4444-4444-8444-444444444444", startedAt: at, endedAt: null, selfieState: "PENDING", selfieReason: null, selfieReviewedBy: null, inZoneSeconds: 3600 }],
  statusEvents: [],
};

describe("rider parsers", () => {
  it("accept the contract shape", () => {
    expect(riderDetailSchema.parse(riderDetail).rider.kycName).toBe("RAVI KUMAR");
    expect(riderPageSchema.parse({ riders: [riderDetail.rider], nextCursor: null }).riders).toHaveLength(1);
  });

  it("drop fields the screens don't use, including anything private", () => {
    const parsed = riderDetailSchema.parse({
      ...riderDetail, aadhaarNumber: "1234 5678 9012",
      payoutAccount: { ...riderDetail.payoutAccount, upiId: "ravi@okaxis", accountNumber: "1234567890" },
      documents: [{ ...riderDetail.documents[0], blobName: "kyc/private.pdf" }],
    });
    expect(parsed).not.toHaveProperty("aadhaarNumber");
    expect(parsed.payoutAccount).not.toHaveProperty("upiId");
    expect(parsed.payoutAccount).not.toHaveProperty("accountNumber");
    expect(parsed.documents[0]).not.toHaveProperty("blobName");
    expect(riderPageSchema.parse({ riders: [{ ...riderDetail.rider, phone: "+919876543210" }], nextCursor: null }).riders[0]).not.toHaveProperty("phone");
  });

  it("read the heartbeat, phone health and recent offers, and refuse an unknown offer state or channel", () => {
    const offer = {
      offerId: "55555555-5555-4555-8555-555555555555", tripId: "66666666-6666-4666-8666-666666666666", orderCode: "#0A1B2C3D", state: "ACCEPTED",
      offeredAt: at, pushedAt: at, pushResult: "SENT", rangAt: at, rangChannel: "fcm",
    };
    const shift = { ...riderDetail.shifts[0], lastSeenAt: at, maxSilenceSeconds: 40, silencesOver60s: 0, phone: null };
    const parsed = riderDetailSchema.parse({ ...riderDetail, shifts: [shift], recentOffers: [offer] });
    expect(parsed.shifts[0].maxSilenceSeconds).toBe(40);
    expect(parsed.recentOffers?.[0].rangChannel).toBe("fcm");
    expect(riderDetailSchema.parse(riderDetail).recentOffers).toBeUndefined();
    expect(riderDetailSchema.safeParse({ ...riderDetail, recentOffers: [{ ...offer, state: "PENDING" }] }).success).toBe(false);
    expect(riderDetailSchema.safeParse({ ...riderDetail, recentOffers: [{ ...offer, rangChannel: "sms" }] }).success).toBe(false);
  });

  it("refuse an unknown status, a bad id, an Aadhaar document type or a missing list", () => {
    expect(riderDetailSchema.safeParse({ ...riderDetail, rider: { ...riderDetail.rider, status: "BLOCKED" } }).success).toBe(false);
    expect(riderDetailSchema.safeParse({ ...riderDetail, rider: { ...riderDetail.rider, riderId: "R1" } }).success).toBe(false);
    expect(riderDetailSchema.safeParse({ ...riderDetail, documents: [{ ...riderDetail.documents[0], type: "AADHAAR" }] }).success).toBe(false);
    expect(riderDetailSchema.safeParse({ ...riderDetail, devices: undefined }).success).toBe(false);
  });
});

describe("document expiry and vehicle", () => {
  it("accept a PUC certificate and approve with or without an expiry date", () => {
    expect(riderDocumentSchema.parse({ ...riderDetail.documents[0], type: "PUC" }).type).toBe("PUC");
    expect(approveDocumentSchema.parse(undefined)).toBeUndefined();
    expect(approveDocumentSchema.parse({ expiresOn: "2027-04-30", reviewer: "x" })).toEqual({ expiresOn: "2027-04-30" });
    expect(approveDocumentSchema.safeParse({ expiresOn: "30-04-2027" }).success).toBe(false);
  });

  it("need the printed expiry date, today (IST) or later", () => {
    expect(expiryProblem("2026-10-21", "2026-10-21")).toBeNull();
    expect(expiryProblem("2026-10-20", "2026-10-21")).toBe("This document has expired. Reject it so the rider uploads a new one.");
    expect(expiryProblem("", "2026-10-21")).toBe("Enter the expiry date printed on the document.");
  });

  it("read the masked vehicle and drop the full registration number", () => {
    expect(riderVehicleSchema.parse({ label: "Honda Activa 6G", regNumberMasked: "TS09xx1234", regNumber: "TS09EA1234" })).toEqual({ label: "Honda Activa 6G", regNumberMasked: "TS09xx1234" });
    expect(riderVehicleSchema.safeParse({ label: "Honda Activa 6G" }).success).toBe(false);
  });

  it("take Indian registration numbers, including BH series", () => {
    for (const regNumber of ["TS09EA1234", "KA011234", "22BH1234AB"]) expect(riderVehicleInputSchema.safeParse({ label: "Bike", regNumber }).success, regNumber).toBe(true);
    for (const regNumber of ["TS-09-EA-1234", "ts09ea1234", "TS09EA12345"]) expect(riderVehicleInputSchema.safeParse({ label: "Bike", regNumber }).success, regNumber).toBe(false);
    expect(riderVehicleInputSchema.safeParse({ label: " ", regNumber: "TS09EA1234" }).error?.issues[0]?.message).toBe("Enter the vehicle, like Honda Activa 6G.");
  });
});

describe("status event rules", () => {
  const now = Date.parse("2026-10-20T10:00:00Z");
  const hours = (count: number) => new Date(now + count * 3_600_000).toISOString();
  const base: StatusEventInput = { kind: "NOTICE", reason: "Cash not handed over", evidenceSummary: "Two customer calls and the trip log", appealPhone: "+914012345678" };

  it("need a 7-day notice deadline", () => {
    expect(statusEventProblem({ ...base }, now)).toBe("The notice deadline must be at least 7 days from now.");
    expect(statusEventProblem({ ...base, deadline: hours(7 * 24 - 1) }, now)).toBe("The notice deadline must be at least 7 days from now.");
    expect(statusEventProblem({ ...base, deadline: hours(7 * 24) }, now)).toBeNull();
  });

  it("need a safety pause review within 72 hours", () => {
    const pause: StatusEventInput = { ...base, kind: "SAFETY_PAUSE" };
    expect(statusEventProblem({ ...pause, reviewBy: hours(73) }, now)).toBe("The safety pause review must be within the next 72 hours.");
    expect(statusEventProblem({ ...pause, reviewBy: hours(-1) }, now)).toBe("The safety pause review must be within the next 72 hours.");
    expect(statusEventProblem({ ...pause, reviewBy: hours(72) }, now)).toBeNull();
  });

  it("need a reason, evidence and an appeal phone except to restore", () => {
    expect(statusEventProblem({ ...base, reason: " " , deadline: hours(200) }, now)).toBe("Write a reason of at least 3 characters.");
    expect(statusEventProblem({ ...base, evidenceSummary: "", deadline: hours(200) }, now)).toBe("Summarise the evidence in at least 3 characters.");
    expect(statusEventProblem({ ...base, appealPhone: undefined, deadline: hours(200) }, now)).toBe("Add the appeal phone number: +91 and 10 digits.");
    expect(statusEventProblem({ kind: "RESTORE", reason: "Review done", evidenceSummary: "Hospital letter seen" }, now)).toBeNull();
  });
});

describe("payout account input", () => {
  const upi = { method: "UPI", upiId: "ravi@okaxis", holderName: "RAVI KUMAR", verifiedInPerson: true };
  it("needs the in-person tick and the method's details", () => {
    expect(payoutAccountInputSchema.safeParse(upi).success).toBe(true);
    expect(payoutAccountInputSchema.safeParse({ ...upi, verifiedInPerson: false }).error?.issues[0]?.message).toBe("Tick that you saw the rider and their ID in person.");
    expect(payoutAccountInputSchema.safeParse({ ...upi, upiId: undefined }).success).toBe(false);
    expect(payoutAccountInputSchema.safeParse({ method: "BANK", accountNumber: "123456789012", ifsc: "SBIN0001234", holderName: "RAVI KUMAR", verifiedInPerson: true }).success).toBe(true);
    expect(payoutAccountInputSchema.safeParse({ method: "BANK", accountNumber: "1234", ifsc: "SBIN0001234", holderName: "RAVI KUMAR", verifiedInPerson: true }).success).toBe(false);
  });
});

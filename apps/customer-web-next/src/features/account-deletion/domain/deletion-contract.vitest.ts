import { describe, expect, it } from "vitest";
import {
  ADMIN_STATUS_FILTERS, isDeletionScope, parseAdminDetail, parseAdminPage, parseAdminSummary, parseDeletionView, parseOpenItems,
} from "@/features/account-deletion/domain/deletion-contract";

const view = { requestId: "r1", scope: "ALL", status: "SCHEDULED", requestedAt: "2026-11-05T05:00:00Z", dueAt: "2026-12-05T05:00:00Z", reviewNote: null };
const summary = { requestId: "r1", identityId: "i1", scope: "CHEF", status: "PENDING_REVIEW", via: "WEB", requestedAt: "2026-11-05T05:00:00Z", dueAt: null, reviewedBy: null, reviewedAt: null, reviewNote: null };
const step = { phase: "ERASE", service: "catalog", status: "DONE", attempts: 1, lastError: null, completedAt: "2026-12-05T05:00:00Z" };
const blocker = { service: "order", code: "OPEN_ORDERS", detail: "2 orders" };
const detail = { request: summary, phoneLast4: "6787", roles: ["CUSTOMER", "CHEF"], steps: [step], blockers: [blocker] };

describe("deletion contract", () => {
  it("parseDeletionView accepts a valid body and fills missing optional fields with null", () => {
    expect(parseDeletionView(view)).toEqual(view);
    expect(parseDeletionView({ ...view, dueAt: undefined, reviewNote: undefined })).toEqual({ ...view, dueAt: null, reviewNote: null });
  });
  it("parseDeletionView rejects a missing requestId, an unknown status or scope, and non-objects", () => {
    expect(parseDeletionView({ ...view, requestId: undefined })).toBeNull();
    expect(parseDeletionView({ ...view, status: "SOMETHING_NEW" })).toBeNull();
    expect(parseDeletionView({ ...view, scope: "RIDER" })).toBeNull();
    expect(parseDeletionView(null)).toBeNull();
    expect(parseDeletionView("x")).toBeNull();
  });

  it("parseAdminSummary accepts a valid body and rejects bad ones", () => {
    expect(parseAdminSummary(summary)).toEqual(summary);
    expect(parseAdminSummary({ ...summary, requestId: undefined })).toBeNull();
    expect(parseAdminSummary({ ...summary, status: "NOPE" })).toBeNull();
    expect(parseAdminSummary({ ...summary, scope: "NOPE" })).toBeNull();
    expect(parseAdminSummary({ ...summary, via: "FAX" })).toBeNull();
  });

  it("parseAdminPage accepts a page and rejects a non-array items or a bad row", () => {
    expect(parseAdminPage({ items: [summary], nextCursor: "abc" })).toEqual({ items: [summary], nextCursor: "abc" });
    expect(parseAdminPage({ items: [] })).toEqual({ items: [], nextCursor: null });
    expect(parseAdminPage({ items: "nope", nextCursor: null })).toBeNull();
    expect(parseAdminPage({ items: [{ ...summary, requestId: undefined }], nextCursor: null })).toBeNull();
  });

  it("parseAdminDetail adds canDecide from the caller and rejects bad bodies", () => {
    expect(parseAdminDetail(detail, true)).toEqual({ ...detail, canDecide: true });
    expect(parseAdminDetail(detail, false)?.canDecide).toBe(false);
    expect(parseAdminDetail({ ...detail, request: { ...summary, requestId: undefined } }, true)).toBeNull();
    expect(parseAdminDetail({ ...detail, request: { ...summary, status: "NOPE" } }, true)).toBeNull();
    expect(parseAdminDetail({ ...detail, request: { ...summary, scope: "NOPE" } }, true)).toBeNull();
    expect(parseAdminDetail({ ...detail, steps: "nope" }, true)).toBeNull();
    expect(parseAdminDetail({ ...detail, blockers: {} }, true)).toBeNull();
    expect(parseAdminDetail({ ...detail, phoneLast4: undefined }, true)?.phoneLast4).toBeNull();
  });

  it("parseOpenItems reads the blockers of a refused approval", () => {
    expect(parseOpenItems({ code: "ACCOUNT_DELETION_HAS_OPEN_ITEMS", message: "x", blockers: [blocker, { service: "payment", code: "SERVICE_UNREACHABLE" }] }))
      .toEqual([blocker, { service: "payment", code: "SERVICE_UNREACHABLE", detail: null }]);
    expect(parseOpenItems({ blockers: "nope" })).toBeNull();
    expect(parseOpenItems({ code: "X" })).toBeNull();
    expect(parseOpenItems(null)).toBeNull();
  });

  it("isDeletionScope and the status filters", () => {
    expect(isDeletionScope("CHEF")).toBe(true);
    expect(isDeletionScope("RIDER")).toBe(false);
    expect(isDeletionScope(undefined)).toBe(false);
    expect(ADMIN_STATUS_FILTERS).toEqual(["", "PENDING_REVIEW", "SCHEDULED", "WAITING_ON_OPEN_ITEMS", "ERASING", "CANCELLED", "REJECTED", "COMPLETED"]);
  });
});

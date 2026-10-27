import { describe, expect, it } from "vitest";
import { fixSchema, issuesSchema, mapLink, overdue, sosEventsSchema, SUPPORT_ROUTES, type SupportIssue } from "./support-contract";

const ID = "11111111-1111-4111-8111-111111111111";
const issue: SupportIssue = {
  issueId: ID, riderId: ID, riderName: "Ravi Kumar", tripId: null, category: "MISSING_PAY", text: "", state: "OPEN",
  createdAt: "2026-10-20T06:30:00Z", acknowledgeBy: "2026-10-21T06:30:00Z", fixBy: "2026-10-23T06:30:00Z",
};

describe("support parsers", () => {
  it("read an issue from an older server without the handling fields, and from this one with them", () => {
    expect(issuesSchema.parse({ issues: [issue] }).issues[0]).toEqual(issue);
    const fixed = { ...issue, state: "FIXED", acknowledgedAt: "2026-10-20T07:00:00Z", acknowledgedBy: "Asha", fixedAt: "2026-10-20T09:00:00Z",
      fixedBy: "Kiran", resolution: "Credited the missing ₹67" };
    expect(issuesSchema.parse({ issues: [fixed] }).issues[0]).toEqual(fixed);
    expect(issuesSchema.safeParse({ issues: [{ ...issue, state: "CLOSED" }] }).success).toBe(false);
  });

  it("read SOS presses with or without a fix and the alert time", () => {
    const sos = { sosId: ID, riderId: ID, riderName: "Ravi Kumar", phoneMasked: "+91 98xxxxx210", at: "2026-10-20T06:30:00Z", lat: null, lng: null, tripId: null };
    expect(sosEventsSchema.parse({ events: [sos] }).events[0].alertedAt).toBeUndefined();
    expect(sosEventsSchema.parse({ events: [{ ...sos, alertedAt: null }] }).events[0].alertedAt).toBeNull();
    expect(sosEventsSchema.safeParse({ events: [{ ...sos, lat: 91 }] }).success).toBe(false);
  });

  it("asks what was done before an issue is fixed", () => {
    expect(fixSchema.safeParse({ resolution: "ok" }).error?.issues[0]?.message).toBe("Write a reason of at least 3 characters.");
    expect(fixSchema.safeParse({ resolution: "Credited the missing pay" }).success).toBe(true);
  });
});

describe("support rules", () => {
  it("flags an issue that missed its acknowledge-by or fix-by time", () => {
    expect(overdue(issue, new Date("2026-10-21T06:00:00Z"))).toBeNull();
    expect(overdue(issue, new Date("2026-10-21T07:00:00Z"))).toBe("ACKNOWLEDGE");
    expect(overdue({ ...issue, state: "ACKNOWLEDGED" }, new Date("2026-10-21T07:00:00Z"))).toBeNull();
    expect(overdue({ ...issue, state: "ACKNOWLEDGED" }, new Date("2026-10-23T07:00:00Z"))).toBe("FIX");
    expect(overdue({ ...issue, state: "FIXED" }, new Date("2026-10-30T07:00:00Z"))).toBeNull();
  });

  it("links a known position to a map and nothing else", () => {
    expect(mapLink({ lat: 17.4483, lng: 78.3915 })).toBe("https://maps.google.com/?q=17.448300,78.391500");
    expect(mapLink({ lat: null, lng: null })).toBeNull();
  });

  it("forwards only the four support operations", () => {
    expect(SUPPORT_ROUTES.map(route => `${route.method} ${route.path}`)).toEqual([
      "GET support-issues", "POST support-issues/:id/acknowledge", "POST support-issues/:id/fix", "GET sos-events",
    ]);
  });
});

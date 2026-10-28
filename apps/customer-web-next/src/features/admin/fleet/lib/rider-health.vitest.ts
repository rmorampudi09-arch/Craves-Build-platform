import { describe, expect, it } from "vitest";
import type { RiderOffer, RiderShift } from "./rider-contract";
import { lastHeard, offerWhy, onShift, phoneReport, pushed, rang, silence } from "./rider-health";

const at = "2026-10-20T06:30:00Z";
const now = Date.parse(at);
const shift: RiderShift = {
  shiftId: "44444444-4444-4444-8444-444444444444", startedAt: "2026-10-20T04:30:00Z", endedAt: null, selfieState: "APPROVED",
  selfieReason: null, selfieReviewedBy: "Asha", inZoneSeconds: 3600,
};
const phone = { batteryPct: 54, charging: false, powerSave: false, canRing: true, batteryPerHourPct: null, lastExitReason: null, queuePending: 0, queueOldestAgeS: null };
const offer: RiderOffer = {
  offerId: "55555555-5555-4555-8555-555555555555", tripId: "66666666-6666-4666-8666-666666666666", orderCode: "#0A1B2C3D", state: "ACCEPTED",
  offeredAt: at, pushedAt: at, pushResult: "SENT", rangAt: "2026-10-20T06:30:02Z", rangChannel: "fcm",
};

describe("shift health in words", () => {
  it("says when an open shift's phone last called, and flags a silent one", () => {
    expect(lastHeard({ ...shift, lastSeenAt: "2026-10-20T06:29:50Z" }, now)).toBe("10 s ago");
    expect(lastHeard({ ...shift, lastSeenAt: "2026-10-20T06:25:00Z" }, now)).toBe("5 min ago: the phone may have stopped");
    expect(lastHeard({ ...shift, lastSeenAt: "2026-10-20T03:00:00Z" }, now)).toBe("3.5 h ago: the phone may have stopped");
    // A server clock ahead of the console's never reads as the future.
    expect(lastHeard({ ...shift, lastSeenAt: "2026-10-20T06:30:05Z" }, now)).toBe("0 s ago");
  });

  it("shows nothing for an ended shift or an older server", () => {
    expect(lastHeard({ ...shift, lastSeenAt: at, endedAt: at }, now)).toBe("—");
    expect(lastHeard(shift, now)).toBe("—");
    expect(silence(shift)).toBe("—");
  });

  it("gives the longest silence and how many passed 60 s", () => {
    expect(silence({ ...shift, maxSilenceSeconds: 12, silencesOver60s: 0 })).toBe("12 s");
    expect(silence({ ...shift, maxSilenceSeconds: 75, silencesOver60s: 1 })).toBe("75 s · 1 over 60 s");
    expect(silence({ ...shift, maxSilenceSeconds: 600, silencesOver60s: 3 })).toBe("10 min · 3 over 60 s");
  });

  it("reports only what is worth a look on the phone", () => {
    expect(phoneReport(undefined)).toBe("No report");
    expect(phoneReport(null)).toBe("No report");
    expect(phoneReport(phone)).toBe("Battery 54%");
    expect(phoneReport({ ...phone, batteryPct: 80.6, charging: true })).toBe("Battery 81%, charging");
    expect(phoneReport({
      ...phone, powerSave: true, canRing: false, batteryPerHourPct: 6.2, lastExitReason: "LOW_MEMORY", queuePending: 2, queueOldestAgeS: 95,
    })).toBe("Battery 54% · battery saver on · offers can't ring · 6.2% an hour unplugged · app last ended: Low memory · 2 steps waiting to sync (oldest 95 s)");
    expect(phoneReport({ ...phone, batteryPct: null, queuePending: 1 })).toBe("1 step waiting to sync");
    expect(phoneReport({ ...phone, batteryPct: null })).toBe("No report");
  });
});

describe("offer delivery in words", () => {
  it("says how soon the phone rang and by which channel", () => {
    expect(rang(offer)).toBe("2.0 s, by push");
    expect(rang({ ...offer, rangAt: "2026-10-20T06:30:11.400Z", rangChannel: "locations" })).toBe("11.4 s, by the location call");
    expect(rang({ ...offer, rangAt: null, rangChannel: null })).toBe("Didn't ring");
  });

  it("says what the push did", () => {
    expect(pushed(offer)).toBe("Sent");
    expect(pushed({ ...offer, pushResult: "NO_TOKEN" })).toBe("No token");
    expect(pushed({ ...offer, pushedAt: null, pushResult: null })).toBe("Not pushed");
  });
});

describe("Phase 4 in words", () => {
  it("says why the offer went to this rider, as the rider was told", () => {
    expect(offerWhy(offer)).toBe("—");
    expect(offerWhy({ ...offer, reason: { rule: "NEAREST", place: 1, riders: 4, atOnce: 3, round: 1 } })).toBe("Nearest: 1 of 4 free riders, 3 at once");
    expect(offerWhy({ ...offer, reason: { rule: "NEAREST", place: 1, riders: 2, atOnce: 1, round: 2 } })).toBe("Nearest: 1 of 2 free riders, round 2");
    expect(offerWhy({ ...offer, reason: { rule: "FAIR", place: 1, riders: 3, atOnce: 1, round: 1, bandM: 1500, bandRiders: 2, earnedPerHourPaise: 9000, freeMinutes: 12 } }))
      .toBe("Fair turn: 1 of 2 within 1.5 km, ₹90.00 an hour today, free 12 min");
  });

  it("shows a break on an open shift", () => {
    expect(onShift(shift, value => value)).toBe("On shift");
    expect(onShift({ ...shift, onBreakUntil: at }, () => "12:00 pm")).toBe("On a break until 12:00 pm");
  });
});

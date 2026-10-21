import { describe, expect, it } from "vitest";
import { dispatchQueueSchema, formatAge, positionsSchema, reassignSchema, tripsSchema } from "./trip-contract";

const TRIP = "77777777-7777-4777-8777-777777777777";
const RIDER = "11111111-1111-4111-8111-111111111111";
const at = "2026-10-20T06:30:00Z";
const trip = { tripId: TRIP, orderCode: "#0BDE0107", kitchenName: "Lakshmi's Kitchen", dropArea: "Madhapur", state: "PICKED_UP", provider: "CRAVES_FLEET", riderId: RIDER, riderName: "Ravi Kumar", createdAt: at, updatedAt: at };
const queued = { tripId: TRIP, orderCode: "#0BDE0107", kitchenName: "Lakshmi's Kitchen", dropArea: "Madhapur", queuedAt: at, alertLevel: "CRITICAL", alertMessage: "Waiting 12 minutes", attempts: [{ provider: "BORZO", outcome: "NO_COURIER", at }] };
const position = { riderId: RIDER, riderName: "Ravi Kumar", lat: 17.44, lng: 78.38, recordedAt: at, ageSeconds: 75, onShift: true, onTrip: false, tripId: null, mock: true };

describe("trip parsers", () => {
  it("accept the contract shapes and drop unknown fields", () => {
    expect(tripsSchema.parse({ trips: [{ ...trip, customerPhone: "+919876543210" }] }).trips[0]).not.toHaveProperty("customerPhone");
    expect(dispatchQueueSchema.parse({ items: [queued] }).items[0].alertLevel).toBe("CRITICAL");
    expect(positionsSchema.parse({ positions: [{ ...position, accuracyM: 12 }] }).positions[0]).toEqual(position);
  });

  it("refuse an unknown provider, a bad order code or an impossible fix", () => {
    expect(tripsSchema.safeParse({ trips: [{ ...trip, provider: "DUNZO" }] }).success).toBe(false);
    expect(tripsSchema.safeParse({ trips: [{ ...trip, orderCode: "0BDE0107" }] }).success).toBe(false);
    expect(positionsSchema.safeParse({ positions: [{ ...position, lat: 91 }] }).success).toBe(false);
    expect(dispatchQueueSchema.safeParse({ items: [{ ...queued, alertLevel: "LOUD" }] }).success).toBe(false);
  });
});

describe("reassign", () => {
  it("needs exactly one new courier and a reason", () => {
    expect(reassignSchema.safeParse({ riderId: RIDER, reason: "Rider's bike broke down" }).success).toBe(true);
    expect(reassignSchema.safeParse({ provider: "PIDGE", reason: "No rider nearby" }).success).toBe(true);
    expect(reassignSchema.safeParse({ reason: "No rider nearby" }).error?.issues[0]?.message).toBe("Choose one new courier: a rider, Borzo or Pidge.");
    expect(reassignSchema.safeParse({ riderId: RIDER, provider: "BORZO", reason: "Both" }).success).toBe(false);
    expect(reassignSchema.safeParse({ provider: "BORZO", reason: "" }).success).toBe(false);
  });
});

it("shows how old a fix is", () => {
  expect(formatAge(42)).toBe("42 s ago");
  expect(formatAge(75)).toBe("1 min ago");
  expect(formatAge(3_900)).toBe("1 h 5 min ago");
});

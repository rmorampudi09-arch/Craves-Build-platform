import { describe, expect, it } from "vitest";
import { SLOT_ROUTES, slotsSchema, slotSchema, zoneBannerSchema } from "./slot-contract";

const RIDER = "11111111-1111-4111-8111-111111111111";
const SLOT = "77777777-7777-4777-8777-777777777777";
const slot = { slotId: SLOT, riderId: RIDER, riderName: "Ravi Kumar", zoneName: "Madhapur", startsAt: "2026-10-21T12:30:00Z", endsAt: "2026-10-21T16:30:00Z", guaranteedPerHourPaise: 8000, status: "BOOKED" };
const banner = { tone: "warning", text: "Heavy rain in Madhapur. Ride slowly.", until: "2026-10-21T16:30:00Z" };

describe("slot parsers", () => {
  it("accept the contract shape, with or without the settlement fields, and drop unknown fields", () => {
    expect(slotsSchema.parse({ slots: [slot] }).slots[0]).toEqual(slot);
    const completed = { ...slot, status: "COMPLETED", onlineInZoneMinutes: 214, topUpPaise: 6500 };
    expect(slotSchema.parse({ ...completed, riderPhone: "+919876543210", ledgerEntryId: "x" })).toEqual(completed);
    expect(slotSchema.parse({ ...slot, onlineInZoneMinutes: null, topUpPaise: null }).topUpPaise).toBeNull();
  });

  it("refuse an unknown status, rupees instead of paise, a negative top-up or a bad id", () => {
    expect(slotSchema.safeParse({ ...slot, status: "MISSED" }).success).toBe(false);
    expect(slotSchema.safeParse({ ...slot, guaranteedPerHourPaise: 80.5 }).success).toBe(false);
    expect(slotSchema.safeParse({ ...slot, topUpPaise: -100 }).success).toBe(false);
    expect(slotSchema.safeParse({ ...slot, slotId: "S1" }).success).toBe(false);
    expect(slotsSchema.safeParse({}).success).toBe(false);
  });
});

describe("zone banner parser", () => {
  it("accepts a banner and drops unknown fields", () => {
    expect(zoneBannerSchema.parse({ ...banner, setBy: "Asha", zoneId: 4 })).toEqual(banner);
  });

  it("refuses another tone, an empty or long text, or a time without a zone", () => {
    expect(zoneBannerSchema.safeParse({ ...banner, tone: "danger" }).success).toBe(false);
    expect(zoneBannerSchema.safeParse({ ...banner, text: " " }).success).toBe(false);
    expect(zoneBannerSchema.safeParse({ ...banner, text: "x".repeat(161) }).success).toBe(false);
    expect(zoneBannerSchema.safeParse({ ...banner, text: "x".repeat(160) }).success).toBe(true);
    expect(zoneBannerSchema.safeParse({ ...banner, until: "2026-10-21T22:00" }).success).toBe(false);
  });

  it("reads no banner (204) as null only on GET and DELETE", () => {
    const response = (method: string) => SLOT_ROUTES.find(route => route.method === method && route.path === "banner")!.response!;
    expect(response("GET").safeParse(null).success).toBe(true);
    expect(response("DELETE").safeParse(null).success).toBe(true);
    expect(response("PUT").safeParse(null).success).toBe(false);
    expect(response("GET").parse({ ...banner, extra: 1 })).toEqual(banner);
  });
});

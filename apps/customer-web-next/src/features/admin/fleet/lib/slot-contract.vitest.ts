import { describe, expect, it } from "vitest";
import {
  bannerFromForm, endsNextDay, istInstant, rupeesToPaise, SLOT_ROUTES, slotFromForm, slotRangeProblem, slotsSchema, slotSchema, zoneBannerSchema,
} from "./slot-contract";

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

describe("slot and banner forms", () => {
  const form = { riderId: RIDER, zoneName: " Madhapur ", date: "2026-10-21", startTime: "18:00", endTime: "22:00", rupeesPerHour: "80" };

  it("read form times as IST and rupees as integer paise", () => {
    expect(istInstant("2026-10-21T18:00")).toBe("2026-10-21T12:30:00.000Z");
    expect(istInstant("2026-10-21T00:15")).toBe("2026-10-20T18:45:00.000Z");
    expect(istInstant("2026-10-21")).toBe("");
    expect(istInstant("2026-10-21T25:00")).toBe("");
    expect(["80", "80.5", "80.50", "80.10", "0.29", "0.05", " 120 "].map(rupeesToPaise)).toEqual([8000, 8050, 8050, 8010, 29, 5, 12000]);
    expect(["", "80.505", "-80", "₹80", "1e3", "80,00"].map(rupeesToPaise)).toEqual([null, null, null, null, null, null]);
  });

  it("build the slot body or name the first problem", () => {
    expect(slotFromForm(form)).toEqual({ riderId: RIDER, zoneName: "Madhapur", startsAt: "2026-10-21T12:30:00.000Z", endsAt: "2026-10-21T16:30:00.000Z", guaranteedPerHourPaise: 8000 });
    expect(slotFromForm({ ...form, riderId: "" })).toBe("Choose the rider.");
    expect(slotFromForm({ ...form, zoneName: "  " })).toBe("Enter the zone name.");
    expect(slotFromForm({ ...form, startTime: "" })).toBe("Pick the date, the start time and the end time.");
    expect(slotFromForm({ ...form, endTime: "18:00" })).toBe("The slot must end after it starts.");
    expect(slotFromForm({ ...form, startTime: "", endTime: "02:00" })).toBe("Pick the date, the start time and the end time.");
  });

  it("end a slot on the next IST day when the end time is before the start time", () => {
    const form = { riderId: RIDER, zoneName: "Madhapur", date: "2026-10-31", startTime: "22:00", endTime: "02:00", rupeesPerHour: "80" };
    expect(slotFromForm(form)).toMatchObject({ startsAt: "2026-10-31T16:30:00.000Z", endsAt: "2026-10-31T20:30:00.000Z" });
    expect(slotFromForm({ ...form, startTime: "18:00", endTime: "00:00" })).toMatchObject({ startsAt: "2026-10-31T12:30:00.000Z", endsAt: "2026-10-31T18:30:00.000Z" });
    // Month and year ends roll over too.
    expect(slotFromForm({ ...form, date: "2026-12-31", startTime: "23:30", endTime: "06:00" })).toMatchObject({ startsAt: "2026-12-31T18:00:00.000Z", endsAt: "2027-01-01T00:30:00.000Z" });
    expect(endsNextDay({ startTime: "22:00", endTime: "02:00" })).toBe(true);
    expect([endsNextDay({ startTime: "18:00", endTime: "22:00" }), endsNextDay({ startTime: "18:00", endTime: "18:00" }), endsNextDay({ startTime: "18:00", endTime: "" })]).toEqual([false, false, false]);
    expect(slotFromForm({ ...form, rupeesPerHour: "0" })).toBe("Enter the guarantee in rupees an hour, like 80 or 80.50.");
  });

  it("list at most 31 days, last day not before the first", () => {
    expect(slotRangeProblem("2026-10-01", "2026-10-31")).toBeNull();
    expect(slotRangeProblem("2026-10-21", "2026-10-21")).toBeNull();
    expect(slotRangeProblem("2026-10-01", "2026-11-01")).toBe("Show at most 31 days at a time.");
    expect(slotRangeProblem("2026-10-21", "2026-10-20")).toBe("The last day must be on or after the first day.");
    expect(slotRangeProblem("", "2026-10-20")).toBe("Pick both dates.");
  });

  it("build the banner or name the first problem", () => {
    const now = Date.parse("2026-10-21T10:00:00Z");
    expect(bannerFromForm({ tone: "warning", text: " Rain ahead ", until: "2026-10-21T22:00" }, now)).toEqual({ tone: "warning", text: "Rain ahead", until: "2026-10-21T16:30:00.000Z" });
    expect(bannerFromForm({ tone: "info", text: "Rain", until: "2026-10-21T15:00" }, now)).toBe("Pick a time in the future.");
    expect(bannerFromForm({ tone: "info", text: "Rain", until: "" }, now)).toBe("Pick until when the banner shows.");
    expect(bannerFromForm({ tone: "info", text: "x".repeat(161), until: "2026-10-21T22:00" }, now)).toBe("Keep the banner to 160 characters.");
  });
});

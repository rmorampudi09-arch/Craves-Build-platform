import { describe, expect, it } from "vitest";
import { bannerFromForm, BANNER_ROUTES, istInstant, zoneBannerSchema } from "./banner-contract";
import { rupeesToPaise } from "./fleet-common";

const banner = { tone: "warning", text: "Heavy rain in Madhapur. Ride slowly.", until: "2026-10-21T16:30:00Z" };

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
    const response = (method: string) => BANNER_ROUTES.find(route => route.method === method && route.path === "banner")!.response!;
    expect(response("GET").safeParse(null).success).toBe(true);
    expect(response("DELETE").safeParse(null).success).toBe(true);
    expect(response("PUT").safeParse(null).success).toBe(false);
    expect(response("GET").parse({ ...banner, extra: 1 })).toEqual(banner);
  });
});

describe("banner form and IST times", () => {
  it("read form times as IST and rupees as integer paise", () => {
    expect(istInstant("2026-10-21T18:00")).toBe("2026-10-21T12:30:00.000Z");
    expect(istInstant("2026-10-21T00:15")).toBe("2026-10-20T18:45:00.000Z");
    expect(istInstant("2026-10-21")).toBe("");
    expect(istInstant("2026-10-21T25:00")).toBe("");
    expect(["80", "80.5", "80.50", "80.10", "0.29", "0.05", " 120 "].map(rupeesToPaise)).toEqual([8000, 8050, 8050, 8010, 29, 5, 12000]);
    expect(["", "80.505", "-80", "₹80", "1e3", "80,00"].map(rupeesToPaise)).toEqual([null, null, null, null, null, null]);
  });

  it("build the banner or name the first problem", () => {
    const now = Date.parse("2026-10-21T10:00:00Z");
    expect(bannerFromForm({ tone: "warning", text: " Rain ahead ", until: "2026-10-21T22:00" }, now)).toEqual({ tone: "warning", text: "Rain ahead", until: "2026-10-21T16:30:00.000Z" });
    expect(bannerFromForm({ tone: "info", text: "Rain", until: "2026-10-21T15:00" }, now)).toBe("Pick a time in the future.");
    expect(bannerFromForm({ tone: "info", text: "Rain", until: "" }, now)).toBe("Pick until when the banner shows.");
    expect(bannerFromForm({ tone: "info", text: "x".repeat(161), until: "2026-10-21T22:00" }, now)).toBe("Keep the banner to 160 characters.");
  });
});

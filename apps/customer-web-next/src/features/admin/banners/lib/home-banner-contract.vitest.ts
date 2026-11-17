import { describe, expect, it } from "vitest";
import { bannerListSchema, bannerShapeProblem, bannerTarget, bannerUpdateSchema } from "./home-banner-contract";

const id = "6212c931-b8ac-4cc7-8cf6-3a9672046b11";
describe("banner-only admin routes", () => {
  it("allows exactly list/upload/update/delete/protected image routes", () => {
    expect(bannerTarget("GET", [])).toBe("/catalog/admin/banners");
    expect(bannerTarget("POST", [])).toBe("/catalog/admin/banners");
    expect(bannerTarget("PUT", [id])).toBe(`/catalog/admin/banners/${id}`);
    expect(bannerTarget("DELETE", [id])).toBe(`/catalog/admin/banners/${id}`);
    expect(bannerTarget("GET", [id, "image"])).toBe(`/catalog/admin/banners/${id}/image`);
    for (const method of ["PATCH", "POST"]) expect(bannerTarget(method, [id])).toBeNull();
    expect(bannerTarget("DELETE", [])).toBeNull();
    expect(bannerTarget("DELETE", [id, "image"])).toBeNull();
    expect(bannerTarget("GET", ["..", "auth"])).toBeNull();
    expect(bannerTarget("GET", [id, "image", "other"])).toBeNull();
  });
  it("validates response references and optimistic versions", () => {
    const time = new Date().toISOString();
    const banner = { id, label: "Craves", imagePath: `/api/v1/catalog/banners/${id}/image`, published: true, sortOrder: 0, createdAt: time, updatedAt: time };
    expect(bannerListSchema.safeParse([banner]).success).toBe(true);
    expect(bannerListSchema.safeParse([{ ...banner, imagePath: "https://untrusted.example/banner.jpg" }]).success).toBe(false);
    expect(bannerUpdateSchema.safeParse({ label: "Craves", sortOrder: 0, published: true, expectedUpdatedAt: time }).success).toBe(true);
    expect(bannerUpdateSchema.safeParse({ label: "Craves", sortOrder: 0, published: true }).success).toBe(false);
    expect(bannerUpdateSchema.safeParse({ label: "Craves\n", sortOrder: 0, published: true, expectedUpdatedAt: time }).success).toBe(true);
    expect(bannerUpdateSchema.safeParse({ label: "Cra\nves", sortOrder: 0, published: true, expectedUpdatedAt: time }).success).toBe(false);
  });
  it("files a banner from a service without platforms under the website, and holds 20 a platform", () => {
    const time = new Date().toISOString();
    const banner = { id, label: "Craves", imagePath: `/api/v1/catalog/banners/${id}/image`, published: true, sortOrder: 0, createdAt: time, updatedAt: time };
    expect(bannerListSchema.parse([banner])[0].platform).toBe("WEB");
    expect(bannerListSchema.parse([{ ...banner, platform: "APP" }])[0].platform).toBe("APP");
    expect(bannerListSchema.safeParse([{ ...banner, platform: "TV" }]).success).toBe(false);
    expect(bannerListSchema.safeParse(Array.from({ length: 40 }, () => banner)).success).toBe(true);
    expect(bannerListSchema.safeParse(Array.from({ length: 41 }, () => banner)).success).toBe(false);
  });
  it("takes pictures twice as wide as tall on both, within a tenth, as the server does", () => {
    for (const platform of ["WEB", "APP"] as const) {
      expect(bannerShapeProblem(1500, 750, platform)).toBeNull();
      expect(bannerShapeProblem(1080, 520, platform)).toBeNull();
      expect(bannerShapeProblem(800, 800, platform)).toMatch(/twice as wide as it is tall/);
      expect(bannerShapeProblem(1600, 600, platform)).toMatch(/This one is 1600 × 600/);
    }
    expect(bannerShapeProblem(1000, 1000, "APP")).toMatch(/1080 × 540/);
    expect(bannerShapeProblem(1000, 1000, "WEB")).toMatch(/1500 × 750/);
  });
});

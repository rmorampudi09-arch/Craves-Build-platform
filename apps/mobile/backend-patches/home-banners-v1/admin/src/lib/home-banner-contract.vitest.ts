import { describe, expect, it } from "vitest";
import { bannerListSchema, bannerTarget, bannerUpdateSchema } from "./home-banner-contract";

const id = "6212c931-b8ac-4cc7-8cf6-3a9672046b11";
describe("banner-only admin routes", () => {
  it("allows exactly list/upload/update/protected image routes", () => {
    expect(bannerTarget("GET", [])).toBe("/catalog/admin/banners");
    expect(bannerTarget("POST", [])).toBe("/catalog/admin/banners");
    expect(bannerTarget("PUT", [id])).toBe(`/catalog/admin/banners/${id}`);
    expect(bannerTarget("GET", [id, "image"])).toBe(`/catalog/admin/banners/${id}/image`);
    for (const method of ["DELETE", "PATCH", "POST"]) expect(bannerTarget(method, [id])).toBeNull();
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
});

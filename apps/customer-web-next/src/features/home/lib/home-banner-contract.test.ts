import assert from "node:assert/strict";
import test from "node:test";
import { parseHomeBannerFeed, parseHomeBanners } from "./home-banner-contract.ts";

const A = "6212c931-b8ac-4cc7-8cf6-3a9672046b11";
const B = "6212c931-b8ac-4cc7-8cf6-3a9672046b12";
const banner = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  label: "Craves homemade food",
  imagePath: `/api/v1/catalog/banners/${id}/image`,
  published: true,
  sortOrder: 0,
  createdAt: "2026-10-01T00:00:00Z",
  ...patch,
});

test("keeps published banners in sortOrder with a same-origin image and nothing else", () => {
  assert.deepEqual(
    parseHomeBannerFeed({
      banners: [
        banner(A, { sortOrder: 5, label: "  Late " }),
        banner(B, { sortOrder: 1 }),
        banner("6212c931-b8ac-4cc7-8cf6-3a9672046b13", { published: false }),
      ],
    }),
    [
      { id: B, label: "Craves homemade food", src: `/api/catalog/banners/${B}/image` },
      { id: A, label: "Late", src: `/api/catalog/banners/${A}/image` },
    ],
  );
  assert.deepEqual(parseHomeBannerFeed({ banners: [] }), []);
});

test("rejects the whole feed when any entry is off", () => {
  for (const body of [
    {},
    { banners: [banner(A, { imagePath: "https://example.com/random.jpg" })] },
    { banners: [banner(A, { imagePath: `/api/v1/catalog/banners/${B}/image` })] },
    { banners: [banner(A, { imagePath: "/api/v1/auth/me" })] },
    { banners: [banner(A), banner(A)] },
    { banners: [banner(A, { label: " " })] },
    { banners: [banner(A, { label: "x".repeat(161) })] },
    { banners: [banner(A, { sortOrder: 1000 })] },
    { banners: [banner("not-a-uuid")] },
    {
      banners: Array.from({ length: 21 }, (_, index) =>
        banner(`6212c931-b8ac-4cc7-8cf6-${String(index).padStart(12, "0")}`),
      ),
    },
  ]) {
    assert.equal(parseHomeBannerFeed(body), null, JSON.stringify(body).slice(0, 120));
  }
});

test("the browser accepts only our own banner image route", () => {
  const ok = { id: A, label: "Fresh", src: `/api/catalog/banners/${A}/image` };
  assert.deepEqual(parseHomeBanners({ banners: [ok] }), [ok]);
  assert.equal(parseHomeBanners({ banners: [{ ...ok, src: "https://evil.example/a.jpg" }] }), null);
  assert.equal(
    parseHomeBanners({ banners: [{ ...ok, src: `/api/catalog/banners/${B}/image` }] }),
    null,
  );
  assert.equal(parseHomeBanners(null), null);
});

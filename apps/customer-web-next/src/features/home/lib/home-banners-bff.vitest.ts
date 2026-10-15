// @vitest-environment node
// Synthetic ids; no backend is contacted.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/public-api", () => ({ publicApiFetch: upstream }));
import { GET as listBanners } from "@/app/api/catalog/banners/route";
import { GET as bannerImage } from "@/app/api/catalog/banners/[bannerId]/image/route";
import { fetchHomeBanners } from "@/features/home/api/home-banners";

const A = "6212c931-b8ac-4cc7-8cf6-3a9672046b11";
const B = "6212c931-b8ac-4cc7-8cf6-3a9672046b12";
const banner = (id: string, sortOrder: number, published = true) => ({
  id,
  label: `Banner ${sortOrder}`,
  imagePath: `/api/v1/catalog/banners/${id}/image`,
  published,
  sortOrder,
});
const image = (id: string) =>
  bannerImage(new NextRequest(`https://craves.in/api/catalog/banners/${id}/image`), {
    params: Promise.resolve({ bannerId: id }),
  });

beforeEach(() => {
  upstream.mockReset();
}); // braces: a returned function would run as teardown
afterEach(() => vi.unstubAllGlobals());

describe("home banners BFF", () => {
  it("lists only published banners in order, each with our own image route, uncached", async () => {
    upstream.mockResolvedValue(
      Response.json({
        banners: [
          banner(A, 2),
          banner(B, 1),
          banner("6212c931-b8ac-4cc7-8cf6-3a9672046b13", 0, false),
        ],
      }),
    );
    const response = await listBanners();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      banners: [
        { id: B, label: "Banner 1", src: `/api/catalog/banners/${B}/image` },
        { id: A, label: "Banner 2", src: `/api/catalog/banners/${A}/image` },
      ],
    });
    expect(upstream).toHaveBeenCalledWith("/catalog/banners");
  });

  it.each([
    [
      "a foreign image path",
      () =>
        upstream.mockResolvedValue(
          Response.json({
            banners: [{ ...banner(A, 0), imagePath: "https://evil.example/x.jpg" }],
          }),
        ),
      502,
      "INVALID_BANNERS_RESPONSE",
    ],
    [
      "a missing route",
      () => upstream.mockResolvedValue(new Response(null, { status: 404 })),
      404,
      "FEATURE_NOT_AVAILABLE",
    ],
    [
      "an upstream failure",
      () => upstream.mockResolvedValue(new Response(null, { status: 500 })),
      503,
      "BANNERS_UNAVAILABLE",
    ],
    [
      "a network failure",
      () => upstream.mockRejectedValue(new TypeError("fetch failed")),
      503,
      "BANNERS_UNAVAILABLE",
    ],
  ])("answers %s", async (_name, arrange, status, code) => {
    arrange();
    const response = await listBanners();
    expect([response.status, (await response.json()).code]).toEqual([status, code]);
  });

  it("streams an allowed image with a public cache header", async () => {
    upstream.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/webp" } }),
    );
    const response = await image(A.toUpperCase());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(upstream.mock.calls[0][0]).toBe(`/catalog/banners/${A}/image`);
  });

  it.each([
    ["a bad id", "../../auth/me", () => undefined, 400, "INVALID_BANNER_ID"],
    [
      "another content type",
      A,
      () =>
        upstream.mockResolvedValue(
          new Response("<svg/>", { headers: { "Content-Type": "image/svg+xml" } }),
        ),
      502,
      "INVALID_BANNER_IMAGE",
    ],
    [
      "an empty image",
      A,
      () =>
        upstream.mockResolvedValue(
          new Response(new Uint8Array(), { headers: { "Content-Type": "image/png" } }),
        ),
      502,
      "INVALID_BANNER_IMAGE",
    ],
    [
      "an oversized image",
      A,
      () =>
        upstream.mockResolvedValue(
          new Response(new Uint8Array(2 * 1024 * 1024 + 1), {
            headers: { "Content-Type": "image/jpeg" },
          }),
        ),
      502,
      "INVALID_BANNER_IMAGE",
    ],
    [
      "an unpublished banner",
      A,
      () => upstream.mockResolvedValue(new Response(null, { status: 404 })),
      404,
      "BANNER_NOT_FOUND",
    ],
    [
      "an upstream failure",
      A,
      () => upstream.mockResolvedValue(new Response(null, { status: 500 })),
      503,
      "BANNER_IMAGE_UNAVAILABLE",
    ],
    [
      "a network failure",
      A,
      () => upstream.mockRejectedValue(new TypeError("fetch failed")),
      503,
      "BANNER_IMAGE_UNAVAILABLE",
    ],
  ])("answers an image request with %s", async (_name, id, arrange, status, code) => {
    arrange();
    const response = await image(id);
    expect([response.status, (await response.json()).code]).toEqual([status, code]);
    expect(response.headers.get("cache-control")).toBe("no-store");
    if (status === 400) expect(upstream).not.toHaveBeenCalled();
  });
});

describe("home banners browser client", () => {
  const ok = { id: A, label: "Fresh", src: `/api/catalog/banners/${A}/image` };

  it("returns the banners from our BFF", async () => {
    const fetch = vi.fn(async () => Response.json({ banners: [ok] }));
    vi.stubGlobal("fetch", fetch);
    expect(await fetchHomeBanners()).toEqual([ok]);
    expect(fetch).toHaveBeenCalledWith(
      "/api/catalog/banners",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it.each([
    ["a failure", async () => Response.json({ code: "BANNERS_UNAVAILABLE" }, { status: 503 })],
    [
      "a foreign image",
      async () => Response.json({ banners: [{ ...ok, src: "https://evil.example/a.jpg" }] }),
    ],
    [
      "no network",
      async () => {
        throw new TypeError("offline");
      },
    ],
  ])("reads %s as no banners", async (_name, answer) => {
    vi.stubGlobal("fetch", vi.fn(answer));
    expect(await fetchHomeBanners()).toEqual([]);
  });
});

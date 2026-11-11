// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/bounded-fetch", () => ({ boundedFetch: upstream }));
import { POST } from "@/app/api/chef/menu/[menuItemId]/images/route";

const menuItemId = "11111111-1111-4111-8111-111111111111";
const post = (bytes: number[] | string, type: string) => {
  const form = new FormData();
  form.set("file", new File([typeof bytes === "string" ? bytes : new Uint8Array(bytes)], "dish.bin", { type }));
  return POST(new NextRequest(`https://craves.in/api/chef/menu/${menuItemId}/images`, {
    method: "POST", headers: { origin: "https://craves.in", cookie: "craves_access_token=fixture" }, body: form,
  }), { params: Promise.resolve({ menuItemId }) });
};

beforeEach(() => { vi.stubEnv("CRAVES_API_BASE_URL", "https://api.example.com/api/v1"); upstream.mockReset(); });
afterEach(() => vi.unstubAllEnvs());

it.each([
  ["JPEG", [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0], "image/jpeg"],
  ["PNG", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0], "image/png"],
  ["WebP", "RIFF\0\0\0\0WEBPVP8 ", "image/webp"],
])("forwards a real %s", async (_, bytes, type) => {
  upstream.mockResolvedValueOnce(Response.json({ uploaded: true }));
  expect((await post(bytes, type)).status).toBe(200);
  expect(upstream).toHaveBeenCalledTimes(1);
});

it.each([
  ["HTML declared as WebP", "<html><script>alert(1)</script></html>", "image/webp"],
  ["a PNG declared as JPEG", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0], "image/jpeg"],
  ["a RIFF that is not WebP", "RIFF\0\0\0\0WAVEfmt ", "image/webp"],
])("refuses %s without contacting Catalog", async (_, bytes, type) => {
  const response = await post(bytes, type);
  expect(response.status).toBe(400);
  expect((await response.json()).code).toBe("INVALID_MENU_IMAGE");
  expect(upstream).not.toHaveBeenCalled();
});

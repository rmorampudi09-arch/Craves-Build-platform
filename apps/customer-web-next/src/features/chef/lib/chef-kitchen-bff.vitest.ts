// @vitest-environment node
// Synthetic kitchen; no backend is contacted.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/server-api", async (original) => ({
  ...(await original<typeof import("@/shared/lib/server-api")>()),
  authenticatedApiFetch: upstream,
}));
import { SessionRequiredError } from "@/shared/lib/server-api";
import { PUT as setAvatar } from "@/app/api/chef/kitchen/chef-avatar/route";
import { POST as uploadPhoto } from "@/app/api/chef/kitchen/photos/route";

const AVATAR = "https://craves.in/media/public/chef-avatars/chef-avatar-04.jpg";
const kitchen = {
  id: "11111111-2222-4333-8444-555555555555",
  identityId: "21111111-2222-4333-8444-555555555555",
  kitchenName: "Fixture kitchen",
  addressLine1: "1 Fixture Road",
  city: "Hyderabad",
  state: "Telangana",
  status: "DRAFT",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  chefPhotoUrl: AVATAR,
  kitchenPhotoUrl: null,
  kitchenPhotoUrls: [],
};

function json(path: string, body: unknown, origin = "https://craves.in") {
  const text = JSON.stringify(body);
  return new NextRequest(`https://craves.in${path}`, {
    method: "PUT",
    headers: { "content-type": "application/json", "content-length": String(text.length), origin },
    body: text,
  });
}

beforeEach(() => {
  upstream.mockReset();
});

describe("chef avatar BFF", () => {
  it("saves one of the 18 faces and answers with the kitchen", async () => {
    upstream.mockResolvedValue(Response.json(kitchen));
    const response = await setAvatar(
      json("/api/chef/kitchen/chef-avatar", { avatarId: "chef-avatar-04" }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).chefPhotoUrl).toBe(AVATAR);
    expect(upstream.mock.calls[0][1]).toBe("/kitchens/me/chef-avatar");
    expect(upstream.mock.calls[0][2]).toMatchObject({
      method: "PUT",
      body: JSON.stringify({ avatarId: "chef-avatar-04" }),
    });
  });

  it.each([
    { avatarId: "chef-avatar-19" },
    { avatarId: "chef-avatar-00" },
    { avatarId: "chef-avatar-4" },
    { avatarId: 4 },
    {},
    { avatarId: "chef-avatar-04", extra: true },
    null,
    "chef-avatar-04",
  ])("rejects %j before calling Catalog", async (body) => {
    expect((await setAvatar(json("/api/chef/kitchen/chef-avatar", body))).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects cross-site writes", async () => {
    expect(
      (
        await setAvatar(
          json(
            "/api/chef/kitchen/chef-avatar",
            { avatarId: "chef-avatar-04" },
            "https://evil.example",
          ),
        )
      ).status,
    ).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    [404, null, 404, "FEATURE_NOT_AVAILABLE"],
    [400, { code: "CHEF_AVATAR_UNKNOWN" }, 400, "CHEF_AVATAR_UNKNOWN"],
    [401, null, 401, "SESSION_EXPIRED"],
    [500, { message: "boom" }, 503, "CHEF_AVATAR_FAILED"],
  ])("maps an upstream %i to %i %s", async (status, body, mappedStatus, code) => {
    upstream.mockResolvedValue(Response.json(body, { status }));
    const response = await setAvatar(
      json("/api/chef/kitchen/chef-avatar", { avatarId: "chef-avatar-01" }),
    );
    expect(response.status).toBe(mappedStatus);
    expect(await response.json()).toEqual({ code });
  });

  it("answers 502 for a reply that is not a kitchen, 401 without a session and 503 when Catalog is unreachable", async () => {
    upstream.mockResolvedValue(Response.json({ id: "nope" }));
    expect(
      (await setAvatar(json("/api/chef/kitchen/chef-avatar", { avatarId: "chef-avatar-01" })))
        .status,
    ).toBe(502);
    upstream.mockRejectedValue(new SessionRequiredError("signed out"));
    expect(
      (await setAvatar(json("/api/chef/kitchen/chef-avatar", { avatarId: "chef-avatar-01" })))
        .status,
    ).toBe(401);
    upstream.mockRejectedValue(new Error("down"));
    expect(
      (await setAvatar(json("/api/chef/kitchen/chef-avatar", { avatarId: "chef-avatar-01" })))
        .status,
    ).toBe(503);
  });
});

function upload(file: File | null, origin = "https://craves.in") {
  const form = new FormData();
  if (file) form.set("file", file);
  return new NextRequest("https://craves.in/api/chef/kitchen/photos", { method: "POST", headers: { origin }, body: form });
}
const photo = (type = "image/jpeg", bytes = 16) => new File([new Uint8Array(bytes)], "kitchen.jpg", { type });

describe("kitchen photos BFF", () => {
  it("sends the photo to Catalog as a kitchen photo and answers with the kitchen", async () => {
    upstream.mockResolvedValue(Response.json({ ...kitchen, kitchenPhotoUrl: "https://craves.in/media/k1.jpg", kitchenPhotoUrls: ["https://craves.in/media/k1.jpg"] }));
    const response = await uploadPhoto(upload(photo()));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).kitchenPhotoUrls).toEqual(["https://craves.in/media/k1.jpg"]);
    expect(upstream.mock.calls[0][1]).toBe("/kitchens/me/photos?kind=KITCHEN");
    expect(upstream.mock.calls[0][2].method).toBe("POST");
    expect((upstream.mock.calls[0][2].body as FormData).get("file")).toMatchObject({ name: "kitchen.jpg", type: "image/jpeg", size: 16 });
  });

  it.each([
    ["no file", null],
    ["a WebP", photo("image/webp")],
    ["a PDF", photo("application/pdf")],
    ["an empty file", photo("image/png", 0)],
    ["a file over 8 MB", photo("image/jpeg", 8 * 1024 * 1024 + 1)],
  ])("rejects %s before calling Catalog", async (_, file) => {
    const response = await uploadPhoto(upload(file));
    expect(response.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects cross-site uploads", async () => {
    expect((await uploadPhoto(upload(photo(), "https://evil.example"))).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    [409, { code: "KITCHEN_PHOTOS_LOCKED" }, 409, "KITCHEN_PHOTOS_LOCKED"],
    [404, null, 404, "FEATURE_NOT_AVAILABLE"],
    [400, { code: "MEDIA_CONTENT_TYPE_NOT_ALLOWED" }, 400, "MEDIA_CONTENT_TYPE_NOT_ALLOWED"],
    [401, null, 401, "SESSION_EXPIRED"],
    [502, null, 503, "KITCHEN_PHOTO_FAILED"],
  ])("maps an upstream %i to %i %s", async (status, body, mappedStatus, code) => {
    upstream.mockResolvedValue(Response.json(body, { status }));
    const response = await uploadPhoto(upload(photo()));
    expect(response.status).toBe(mappedStatus);
    expect(await response.json()).toEqual({ code });
  });

  it("answers 502 for a reply that is not a kitchen and 401 without a session", async () => {
    upstream.mockResolvedValue(Response.json({ uploaded: true }));
    expect((await uploadPhoto(upload(photo()))).status).toBe(502);
    upstream.mockRejectedValue(new SessionRequiredError("signed out"));
    expect((await uploadPhoto(upload(photo()))).status).toBe(401);
  });
});

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

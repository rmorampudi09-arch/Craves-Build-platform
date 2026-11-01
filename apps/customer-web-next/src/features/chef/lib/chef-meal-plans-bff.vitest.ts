// @vitest-environment node
// Synthetic ids; no backend is contacted.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const upstream = vi.hoisted(() => vi.fn());
const publicUpstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/server-api", async (original) => ({
  ...(await original<typeof import("@/shared/lib/server-api")>()),
  authenticatedApiFetch: upstream,
}));
vi.mock("@/shared/lib/public-api", () => ({ publicApiFetch: publicUpstream }));
import { SessionRequiredError } from "@/shared/lib/server-api";
import { GET as list, POST as create } from "@/app/api/chef/subscription-plans/route";
import { PUT as update } from "@/app/api/chef/subscription-plans/[planId]/route";
import {
  GET as readSchedule,
  PUT as putSchedule,
} from "@/app/api/chef/subscription-plans/[planId]/schedule/route";
import { POST as submit } from "@/app/api/chef/subscription-plans/[planId]/submit/route";
import { PATCH as accepting } from "@/app/api/chef/subscription-plans/[planId]/accepting-subscribers/route";
import {
  GET as readImage,
  PUT as putImage,
} from "@/app/api/chef/subscription-plans/[planId]/image/route";

const PLAN_ID = "7f639200-0000-4000-8000-0000000000a1";
const DISH = "44444444-4444-4444-8444-444444444444";
const plan = {
  id: PLAN_ID,
  planCode: "PLAN_1",
  name: "Home lunch",
  description: "Fresh",
  billingPeriod: "WEEKLY",
  amount: 1499,
  currency: "INR",
  status: "DRAFT",
  reviewReason: null,
  submittedAt: null,
  reviewedAt: null,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  imageUrl: null,
  acceptingSubscribers: true,
  activeSubscriberCount: 0,
};
const input = {
  name: "Home lunch",
  description: "Fresh",
  billingPeriod: "FORTNIGHTLY",
  amount: 1499,
  currency: "INR",
};
const meal = {
  menuItemId: DISH,
  quantity: 1,
  isoDayOfWeek: 1,
  dayOfMonth: null,
  mealSlotCode: "LUNCH",
  serviceTime: "12:30",
  sequenceNumber: 1,
};
const scheduleInput = {
  recurrenceType: "WEEKLY",
  timezone: "Asia/Kolkata",
  generationLeadHours: 24,
  items: [meal],
};
const params = { params: Promise.resolve({ planId: PLAN_ID }) };
const badParams = { params: Promise.resolve({ planId: "nope" }) };

function request(
  path: string,
  init: { method?: string; body?: unknown; origin?: string; raw?: BodyInit } = {},
) {
  const body = init.raw ?? (init.body === undefined ? undefined : JSON.stringify(init.body));
  return new NextRequest(`https://craves.in${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(typeof body === "string"
        ? { "content-type": "application/json", "content-length": String(body.length) }
        : {}),
      origin: init.origin ?? "https://craves.in",
    },
    body,
  });
}
const code = async (response: Response) => [response.status, (await response.json()).code];
function photo(type = "image/jpeg", bytes = 10) {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], "plan.jpg", { type }));
  return form;
}

beforeEach(() => {
  upstream.mockReset();
  publicUpstream.mockReset();
});

describe("chef meal plan BFF", () => {
  it("lists plans and maps their photo to our image route", async () => {
    upstream.mockResolvedValue(
      Response.json([{ ...plan, imageUrl: `/api/v1/subscriptions/plans/${PLAN_ID}/image?v=5` }]),
    );
    const response = await list(request("/api/chef/subscription-plans"));
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json())[0].imageUrl).toBe(
      `/api/chef/subscription-plans/${PLAN_ID}/image?v=5`,
    );
  });

  it("maps failures: missing routes to Coming soon, 403 to chef access, broken replies to 502, no session to 401", async () => {
    upstream.mockResolvedValueOnce(new Response("Not found", { status: 404 }));
    expect(await code(await list(request("/api/chef/subscription-plans")))).toEqual([
      404,
      "FEATURE_NOT_AVAILABLE",
    ]);
    upstream.mockResolvedValueOnce(
      Response.json(
        { code: "ROLE_NOT_ALLOWED", message: "CHEF role is required" },
        { status: 403 },
      ),
    );
    const denied = await list(request("/api/chef/subscription-plans"));
    expect([denied.status, await denied.json()]).toEqual([
      403,
      expect.objectContaining({ code: "CHEF_ACCESS_REQUIRED", reason: "ROLE_NOT_ALLOWED" }),
    ]);
    upstream.mockResolvedValueOnce(Response.json([{ ...plan, billingPeriod: "DAILY" }]));
    expect(await code(await list(request("/api/chef/subscription-plans")))).toEqual([
      502,
      "INVALID_CHEF_MEAL_PLANS_RESPONSE",
    ]);
    upstream.mockRejectedValueOnce(new SessionRequiredError("signed out"));
    expect(await code(await list(request("/api/chef/subscription-plans")))).toEqual([
      401,
      "SESSION_EXPIRED",
    ]);
    upstream.mockResolvedValueOnce(Response.json({ code: "INTERNAL" }, { status: 500 }));
    expect((await list(request("/api/chef/subscription-plans"))).status).toBe(503);
  });

  it("creates and updates plans with checked input only", async () => {
    upstream.mockResolvedValue(Response.json(plan, { status: 201 }));
    expect(
      (await create(request("/api/chef/subscription-plans", { method: "POST", body: input })))
        .status,
    ).toBe(201);
    expect(JSON.parse(upstream.mock.calls[0][2].body)).toEqual(input);
    upstream.mockClear();
    for (const body of [
      { ...input, amount: 0 },
      { ...input, currency: "USD" },
      { ...input, billingPeriod: "DAILY" },
      null,
    ]) {
      expect(
        (await create(request("/api/chef/subscription-plans", { method: "POST", body }))).status,
      ).toBe(400);
    }
    expect(
      (
        await create(
          request("/api/chef/subscription-plans", {
            method: "POST",
            body: input,
            origin: "https://evil.example",
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await update(
          request("/api/chef/subscription-plans/nope", { method: "PUT", body: input }),
          badParams,
        )
      ).status,
    ).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
    upstream.mockResolvedValue(
      Response.json(
        {
          code: "PLAN_NOT_EDITABLE",
          message: "Meal schedule can only be changed while the plan is draft or rejected",
        },
        { status: 409 },
      ),
    );
    const conflict = await update(
      request(`/api/chef/subscription-plans/${PLAN_ID}`, { method: "PUT", body: input }),
      params,
    );
    expect([conflict.status, (await conflict.json()).reason]).toEqual([409, "PLAN_NOT_EDITABLE"]);
  });

  it("reads a schedule, keeps 'no schedule yet' apart from a missing route, and sends one week", async () => {
    upstream.mockResolvedValueOnce(
      Response.json(
        { code: "PLAN_SCHEDULE_NOT_FOUND", message: "Meal schedule has not been created yet" },
        { status: 404 },
      ),
    );
    expect(
      await code(
        await readSchedule(request(`/api/chef/subscription-plans/${PLAN_ID}/schedule`), params),
      ),
    ).toEqual([404, "PLAN_SCHEDULE_NOT_FOUND"]);
    expect(
      (
        await putSchedule(
          request(`/api/chef/subscription-plans/${PLAN_ID}/schedule`, {
            method: "PUT",
            body: { ...scheduleInput, recurrenceType: "MONTHLY" },
          }),
          params,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await putSchedule(
          request(`/api/chef/subscription-plans/${PLAN_ID}/schedule`, {
            method: "PUT",
            body: { ...scheduleInput, items: [] },
          }),
          params,
        )
      ).status,
    ).toBe(400);
    expect(upstream).toHaveBeenCalledTimes(1);
    upstream.mockResolvedValueOnce(
      Response.json({
        planId: PLAN_ID,
        recurrenceType: "WEEKLY",
        timezone: "Asia/Kolkata",
        generationLeadHours: 24,
        status: "DRAFT",
        version: 1,
        items: [{ ...meal, id: DISH, menuItemName: "Dal", serviceTime: "12:30:00" }],
        createdAt: "2026-10-01T00:00:00Z",
        updatedAt: "2026-10-01T00:00:00Z",
        activatedAt: null,
      }),
    );
    const saved = await putSchedule(
      request(`/api/chef/subscription-plans/${PLAN_ID}/schedule`, {
        method: "PUT",
        body: scheduleInput,
      }),
      params,
    );
    expect((await saved.json()).items[0].menuItemName).toBe("Dal");
    expect(JSON.parse(upstream.mock.calls[1][2].body)).toEqual(scheduleInput);
  });

  it("submits with an optional note of at most 1,000 characters", async () => {
    upstream.mockResolvedValue(Response.json({ ...plan, status: "PENDING_APPROVAL" }));
    expect(
      (
        await submit(
          request(`/api/chef/subscription-plans/${PLAN_ID}/submit`, { method: "POST" }),
          params,
        )
      ).status,
    ).toBe(200);
    expect(JSON.parse(upstream.mock.calls[0][2].body)).toEqual({ note: null });
    await submit(
      request(`/api/chef/subscription-plans/${PLAN_ID}/submit`, {
        method: "POST",
        body: { note: " Thanks " },
      }),
      params,
    );
    expect(JSON.parse(upstream.mock.calls[1][2].body)).toEqual({ note: "Thanks" });
    expect(
      (
        await submit(
          request(`/api/chef/subscription-plans/${PLAN_ID}/submit`, {
            method: "POST",
            body: { note: "x".repeat(1001) },
          }),
          params,
        )
      ).status,
    ).toBe(400);
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it("switches new subscribers on and off for a live plan", async () => {
    for (const body of [
      {},
      { acceptingSubscribers: "no" },
      { acceptingSubscribers: true, extra: 1 },
    ]) {
      expect(
        (
          await accepting(
            request(`/api/chef/subscription-plans/${PLAN_ID}/accepting-subscribers`, {
              method: "PATCH",
              body,
            }),
            params,
          )
        ).status,
      ).toBe(400);
    }
    expect(upstream).not.toHaveBeenCalled();
    upstream.mockResolvedValueOnce(
      Response.json({ ...plan, status: "ACTIVE", acceptingSubscribers: false }),
    );
    const switched = await accepting(
      request(`/api/chef/subscription-plans/${PLAN_ID}/accepting-subscribers`, {
        method: "PATCH",
        body: { acceptingSubscribers: false },
      }),
      params,
    );
    expect((await switched.json()).acceptingSubscribers).toBe(false);
    expect([
      upstream.mock.calls[0][1],
      upstream.mock.calls[0][2].method,
      JSON.parse(upstream.mock.calls[0][2].body),
    ]).toEqual([
      `/chef/subscription-plans/${PLAN_ID}/accepting-subscribers`,
      "PATCH",
      { acceptingSubscribers: false },
    ]);
    upstream.mockResolvedValueOnce(new Response(null, { status: 405 }));
    expect(
      await code(
        await accepting(
          request(`/api/chef/subscription-plans/${PLAN_ID}/accepting-subscribers`, {
            method: "PATCH",
            body: { acceptingSubscribers: true },
          }),
          params,
        ),
      ),
    ).toEqual([404, "FEATURE_NOT_AVAILABLE"]);
  });

  it("uploads a JPEG or PNG of at most 2 MB and refuses WebP before calling Craves", async () => {
    for (const form of [
      photo("image/webp"),
      photo("image/jpeg", 2_097_153),
      photo("image/jpeg", 0),
    ]) {
      expect(
        (
          await putImage(
            request(`/api/chef/subscription-plans/${PLAN_ID}/image`, { method: "PUT", raw: form }),
            params,
          )
        ).status,
      ).toBe(400);
    }
    expect(
      (
        await putImage(
          request(`/api/chef/subscription-plans/${PLAN_ID}/image`, {
            method: "PUT",
            raw: photo(),
            origin: "https://evil.example",
          }),
          params,
        )
      ).status,
    ).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
    upstream.mockResolvedValueOnce(
      Response.json({ ...plan, imageUrl: `/api/v1/subscriptions/plans/${PLAN_ID}/image?v=9` }),
    );
    const uploaded = await putImage(
      request(`/api/chef/subscription-plans/${PLAN_ID}/image`, { method: "PUT", raw: photo() }),
      params,
    );
    expect((await uploaded.json()).imageUrl).toBe(
      `/api/chef/subscription-plans/${PLAN_ID}/image?v=9`,
    );
    const [, path, init, timeout] = upstream.mock.calls[0];
    expect([
      path,
      init.method,
      (init.body as FormData).get("file") instanceof File,
      timeout,
    ]).toEqual([`/chef/subscription-plans/${PLAN_ID}/image`, "PUT", true, 30_000]);
    upstream.mockResolvedValueOnce(
      Response.json(
        {
          code: "PLAN_IMAGE_TYPE_UNSUPPORTED",
          message: "Plan photo must be a valid JPEG or PNG image",
        },
        { status: 400 },
      ),
    );
    const refused = await putImage(
      request(`/api/chef/subscription-plans/${PLAN_ID}/image`, {
        method: "PUT",
        raw: photo("image/png"),
      }),
      params,
    );
    expect([refused.status, (await refused.json()).code]).toEqual([
      400,
      "PLAN_IMAGE_TYPE_UNSUPPORTED",
    ]);
  });

  it("serves the plan photo from the public image, cached by its version", async () => {
    expect(
      (await readImage(request(`/api/chef/subscription-plans/${PLAN_ID}/image?v=abc`), params))
        .status,
    ).toBe(400);
    expect(
      (await readImage(request("/api/chef/subscription-plans/nope/image?v=1"), badParams)).status,
    ).toBe(400);
    publicUpstream.mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }),
    );
    const image = await readImage(
      request(`/api/chef/subscription-plans/${PLAN_ID}/image?v=7`),
      params,
    );
    expect([
      image.status,
      image.headers.get("content-type"),
      image.headers.get("cache-control"),
      (await image.arrayBuffer()).byteLength,
    ]).toEqual([200, "image/png", "public, max-age=86400", 3]);
    expect(publicUpstream.mock.calls[0][0]).toBe(`/subscriptions/plans/${PLAN_ID}/image?v=7`);
    publicUpstream.mockResolvedValueOnce(
      new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } }),
    );
    expect(
      (await readImage(request(`/api/chef/subscription-plans/${PLAN_ID}/image?v=7`), params))
        .status,
    ).toBe(502);
  });
});

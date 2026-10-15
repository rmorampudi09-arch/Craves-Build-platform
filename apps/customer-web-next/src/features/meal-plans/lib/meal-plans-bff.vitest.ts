// @vitest-environment node
// Synthetic ids; no backend is contacted.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const publicUpstream = vi.hoisted(() => vi.fn());
const boundedUpstream = vi.hoisted(() => vi.fn());
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/public-api", () => ({ publicApiFetch: publicUpstream }));
vi.mock("@/shared/lib/bounded-fetch", () => ({ boundedFetch: boundedUpstream }));
vi.mock("@/shared/lib/server-api", async (original) => ({
  ...(await original<typeof import("@/shared/lib/server-api")>()),
  authenticatedApiFetch: upstream,
}));
import { GET as listPlans } from "@/app/api/subscriptions/plans/route";
import { GET as readPlanImage } from "@/app/api/subscriptions/plans/[planId]/image/route";
import { GET as readSchedule } from "@/app/api/subscriptions/plans/[planId]/schedule/route";
import { POST as createSubscription } from "@/app/api/subscriptions/route";
import { PATCH as pause } from "@/app/api/subscriptions/[subscriptionId]/pause/route";
import { PATCH as resume } from "@/app/api/subscriptions/[subscriptionId]/resume/route";
import { POST as chooseDayCredit } from "@/app/api/subscriptions/[subscriptionId]/day-credits/[creditId]/choice/route";

const PLAN = "11111111-1111-4111-8111-111111111111";
const SUBSCRIPTION = "33333333-3333-4333-8333-333333333333";
const DISH = "44444444-4444-4444-8444-444444444444";
const KITCHEN = "55555555-5555-4555-8555-555555555555";
const ADDRESS = "66666666-6666-4666-8666-666666666666";
const plan = {
  id: PLAN,
  planCode: "WEEKLY-01",
  chefIdentityId: "22222222-2222-4222-8222-222222222222",
  name: "Weekly meals",
  description: null,
  billingPeriod: "WEEKLY",
  amount: 1200,
  currency: "INR",
};
const subscription = {
  id: SUBSCRIPTION,
  planId: PLAN,
  status: "PAUSED",
  startDate: "2026-10-05",
  endDate: null,
  nextServiceDate: null,
  deliveryAddressId: ADDRESS,
  notes: null,
  createdAt: "2026-10-01T10:00:00Z",
  updatedAt: "2026-10-10T10:00:00Z",
  pauseDaysPerBill: 3,
  pauseDaysLeft: 1,
  pauseAutoResumeDate: "2026-10-20",
  dayCredits: [],
};
const params = <T>(value: T) => ({ params: Promise.resolve(value) });

function request(
  path: string,
  init: { method?: string; body?: unknown; origin?: string; headers?: Record<string, string> } = {},
) {
  const body = init.body === undefined ? undefined : JSON.stringify(init.body);
  return new NextRequest(`https://craves.in${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(body
        ? { "content-type": "application/json", "content-length": String(body.length) }
        : {}),
      origin: init.origin ?? "https://craves.in",
      ...init.headers,
    },
    body,
  });
}

beforeEach(() => {
  publicUpstream.mockReset();
  boundedUpstream.mockReset();
  upstream.mockReset();
  vi.stubEnv("CRAVES_API_BASE_URL", "https://api.example.test/api/v1");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("meal plan list BFF", () => {
  it("keeps 14-day plans and drops a malformed one instead of failing the list", async () => {
    const fortnightly = {
      ...plan,
      id: "77777777-7777-4777-8777-777777777777",
      billingPeriod: "FORTNIGHTLY",
    };
    publicUpstream.mockResolvedValue(Response.json([plan, { ...plan, id: "broken" }, fortnightly]));
    const response = await listPlans(
      new NextRequest("https://craves.in/api/subscriptions/plans?latitude=17.4&longitude=78.4"),
    );
    expect(response.status).toBe(200);
    expect(
      (await response.json()).map((item: { billingPeriod: string }) => item.billingPeriod),
    ).toEqual(["WEEKLY", "FORTNIGHTLY"]);
    expect(publicUpstream.mock.calls[0][0]).toBe(
      "/subscriptions/plans?latitude=17.4&longitude=78.4",
    );
  });

  it("refuses a missing, empty or out-of-range location before the backend", async () => {
    for (const query of ["latitude=17.4", "latitude=&longitude=", "latitude=91&longitude=78.4", "latitude=17.4&longitude=-181", "latitude=x&longitude=78.4"]) {
      const response = await listPlans(new NextRequest(`https://craves.in/api/subscriptions/plans?${query}`));
      expect([query, response.status, (await response.json()).code]).toEqual([query, 400, "INVALID_LOCATION"]);
    }
    expect(publicUpstream).not.toHaveBeenCalled();
  });

  it("answers 502 only when the list itself is not a list", async () => {
    publicUpstream.mockResolvedValue(Response.json({ plans: [plan] }));
    const response = await listPlans(new NextRequest("https://craves.in/api/subscriptions/plans"));
    expect([response.status, (await response.json()).code]).toEqual([
      502,
      "INVALID_SUBSCRIPTION_PLANS_RESPONSE",
    ]);
  });

  it("turns the server's plan photo path into our own image route", async () => {
    publicUpstream.mockResolvedValue(
      Response.json([
        { ...plan, imageUrl: `/api/v1/subscriptions/plans/${PLAN}/image?v=9` },
        { ...plan, id: SUBSCRIPTION, imageUrl: "http://evil.example/x.jpg" },
      ]),
    );
    const [withPhoto, insecure] = await (
      await listPlans(new NextRequest("https://craves.in/api/subscriptions/plans"))
    ).json();
    expect(withPhoto.imageUrl).toBe(`/api/subscriptions/plans/${PLAN}/image?v=9`);
    expect(insecure.imageUrl).toBeNull();
  });

  it("serves the plan photo from the public plan image, JPEG or PNG only", async () => {
    publicUpstream.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/jpeg" } }),
    );
    const params = Promise.resolve({ planId: PLAN });
    const photo = await readPlanImage(
      new NextRequest(`https://craves.in/api/subscriptions/plans/${PLAN}/image?v=9`),
      { params },
    );
    expect(photo.status).toBe(200);
    expect(photo.headers.get("content-type")).toBe("image/jpeg");
    expect(photo.headers.get("x-content-type-options")).toBe("nosniff");
    expect(publicUpstream).toHaveBeenLastCalledWith(
      `/subscriptions/plans/${PLAN}/image?v=9`,
      expect.anything(),
    );
    const unversioned = await readPlanImage(
      new NextRequest(`https://craves.in/api/subscriptions/plans/${PLAN}/image`),
      { params },
    );
    expect(unversioned.status).toBe(400);
    publicUpstream.mockResolvedValue(
      new Response("<svg/>", { headers: { "Content-Type": "image/svg+xml" } }),
    );
    const svg = await readPlanImage(
      new NextRequest(`https://craves.in/api/subscriptions/plans/${PLAN}/image?v=9`),
      { params },
    );
    expect(svg.status).toBe(502);
  });
});

describe("meal plan schedule BFF", () => {
  it("adds each dish's diet, https photo and the kitchen from the catalog", async () => {
    const schedule = {
      planId: PLAN,
      recurrenceType: "WEEKLY",
      timezone: "Asia/Kolkata",
      items: [
        {
          menuItemId: DISH,
          quantity: 1,
          isoDayOfWeek: 1,
          dayOfMonth: null,
          mealSlotCode: "LUNCH",
          serviceTime: "13:00:00",
          sequenceNumber: 1,
        },
      ],
    };
    const dish = {
      id: DISH,
      itemName: " Dal rice ",
      foodType: "VEG",
      kitchenId: KITCHEN,
      images: [
        { publicUrl: "https://cdn.example/b.jpg", sortOrder: 2 },
        { publicUrl: "http://cdn.example/a.jpg", sortOrder: 1 },
        { publicUrl: "https://cdn.example/main.jpg", primary: true, sortOrder: 3 },
      ],
    };
    boundedUpstream.mockImplementation(async (url: string) =>
      Response.json(url.includes("/catalog/") ? dish : schedule),
    );
    const body = await (
      await readSchedule(
        new Request(`https://craves.in/api/subscriptions/plans/${PLAN}/schedule`),
        params({ planId: PLAN }),
      )
    ).json();
    expect(body.kitchenId).toBe(KITCHEN);
    expect(body.items[0]).toMatchObject({
      itemName: "Dal rice",
      foodType: "VEG",
      imageUrl: "https://cdn.example/main.jpg",
    });
  });

  it("keeps the schedule when the catalog has nothing usable", async () => {
    const schedule = {
      planId: PLAN,
      recurrenceType: "WEEKLY",
      timezone: "Asia/Kolkata",
      items: [
        {
          menuItemId: DISH,
          quantity: 1,
          isoDayOfWeek: 1,
          dayOfMonth: null,
          mealSlotCode: "LUNCH",
          serviceTime: "13:00:00",
          sequenceNumber: 1,
        },
      ],
    };
    boundedUpstream.mockImplementation(async (url: string) =>
      url.includes("/catalog/")
        ? Response.json({ id: DISH, foodType: "MEAT", images: [{ publicUrl: "http://x" }] })
        : Response.json(schedule),
    );
    const body = await (
      await readSchedule(
        new Request(`https://craves.in/api/subscriptions/plans/${PLAN}/schedule`),
        params({ planId: PLAN }),
      )
    ).json();
    expect(body.kitchenId).toBeNull();
    expect(body.items[0]).toMatchObject({ itemName: null, foodType: null, imageUrl: null });
  });
});

describe("meal plan changes BFF", () => {
  it("passes the pause allowance through on success and its friendly code on refusal", async () => {
    upstream.mockResolvedValueOnce(Response.json(subscription));
    const paused = await pause(
      request(`/api/subscriptions/${SUBSCRIPTION}/pause`, {
        method: "PATCH",
        body: { reason: null },
      }),
      params({ subscriptionId: SUBSCRIPTION }),
    );
    expect(await paused.json()).toMatchObject({
      pauseDaysPerBill: 3,
      pauseDaysLeft: 1,
      pauseAutoResumeDate: "2026-10-20",
    });
    upstream.mockResolvedValueOnce(
      Response.json({ code: "SUBSCRIPTION_PAUSE_ALLOWANCE_USED", message: "x" }, { status: 409 }),
    );
    const refused = await pause(
      request(`/api/subscriptions/${SUBSCRIPTION}/pause`, { method: "PATCH", body: {} }),
      params({ subscriptionId: SUBSCRIPTION }),
    );
    expect([refused.status, (await refused.json()).code]).toEqual([
      409,
      "SUBSCRIPTION_PAUSE_ALLOWANCE_USED",
    ]);
  });

  it("keeps RESUME_AFTER_AUTO_RESTART and still checks origin and input first", async () => {
    upstream.mockResolvedValueOnce(
      Response.json({ code: "RESUME_AFTER_AUTO_RESTART", message: "x" }, { status: 400 }),
    );
    const refused = await resume(
      request(`/api/subscriptions/${SUBSCRIPTION}/resume`, {
        method: "PATCH",
        body: { resumeDate: "2026-10-25" },
      }),
      params({ subscriptionId: SUBSCRIPTION }),
    );
    expect([refused.status, (await refused.json()).code]).toEqual([
      400,
      "RESUME_AFTER_AUTO_RESTART",
    ]);
    expect(
      (
        await resume(
          request(`/api/subscriptions/${SUBSCRIPTION}/resume`, {
            method: "PATCH",
            body: { resumeDate: "soon" },
          }),
          params({ subscriptionId: SUBSCRIPTION }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await resume(
          request(`/api/subscriptions/${SUBSCRIPTION}/resume`, {
            method: "PATCH",
            body: { resumeDate: "2026-10-25" },
            origin: "https://evil.example",
          }),
          params({ subscriptionId: SUBSCRIPTION }),
        )
      ).status,
    ).toBe(403);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("tells the customer when the address is too far from the chef", async () => {
    upstream.mockResolvedValueOnce(
      Response.json({ code: "DELIVERY_ADDRESS_OUT_OF_RANGE", message: "x" }, { status: 400 }),
    );
    const response = await createSubscription(
      request("/api/subscriptions", {
        method: "POST",
        body: { planId: PLAN, startDate: "2099-01-01", deliveryAddressId: ADDRESS, notes: null },
        headers: { "Idempotency-Key": "subscription:test-key" },
      }),
    );
    expect([response.status, (await response.json()).code]).toEqual([
      400,
      "DELIVERY_ADDRESS_OUT_OF_RANGE",
    ]);
  });
});

describe("day credit choice BFF", () => {
  const CREDIT = "88888888-8888-4888-8888-888888888888";
  const credit = { id: CREDIT, kind: "PAUSE", firstDate: "2026-10-10", lastDate: "2026-10-12", mealSlotCode: null, days: 3, status: "EXTENDED", refundAmount: null, currency: "INR", choiceDeadline: "2026-10-16T06:00:00Z", extendAvailable: true };
  const path = `/api/subscriptions/${SUBSCRIPTION}/day-credits/${CREDIT}/choice`;
  const choose = (body: unknown, ids = { subscriptionId: SUBSCRIPTION, creditId: CREDIT }, origin?: string) =>
    chooseDayCredit(request(path, { method: "POST", body, origin }), params(ids));

  it("forwards one choice and returns the settled credit, uncached", async () => {
    upstream.mockResolvedValue(Response.json({ ...credit, internal: "dropped" }));
    const response = await choose({ choice: "EXTEND" });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(credit);
    expect(upstream.mock.calls[0][1]).toBe(`/subscriptions/${SUBSCRIPTION}/day-credits/${CREDIT}/choice`);
    expect(JSON.parse(upstream.mock.calls[0][2].body)).toEqual({ choice: "EXTEND" });
  });

  it("rejects bad ids, bad choices and cross-site posts before the backend", async () => {
    expect((await choose({ choice: "EXTEND" }, { subscriptionId: "nope", creditId: CREDIT })).status).toBe(400);
    expect((await choose({ choice: "EXTEND" }, { subscriptionId: SUBSCRIPTION, creditId: "nope" })).status).toBe(400);
    for (const body of [{ choice: "BOTH" }, { choice: "REFUND", amount: 1 }, null]) expect((await choose(body)).status).toBe(400);
    expect((await choose({ choice: "REFUND" }, undefined, "https://evil.example")).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    [409, { code: "REFUNDS_NOT_AVAILABLE" }, 409, "REFUNDS_NOT_AVAILABLE"],
    [409, { code: "DAY_CREDIT_ALREADY_SETTLED" }, 409, "DAY_CREDIT_ALREADY_SETTLED"],
    [404, { statusCode: 404, message: "Resource not found" }, 404, "FEATURE_NOT_AVAILABLE"],
    [401, {}, 401, "SESSION_EXPIRED"],
    [500, {}, 503, "DAY_CREDIT_CHOICE_FAILED"],
  ])("maps upstream %i to %i", async (status, body, expected, code) => {
    upstream.mockResolvedValue(Response.json(body, { status }));
    const response = await choose({ choice: "REFUND" });
    expect([response.status, (await response.json()).code]).toEqual([expected, code]);
  });

  it("answers 502 when the backend returns another or a broken credit", async () => {
    upstream.mockResolvedValue(Response.json({ ...credit, id: "99999999-9999-4999-8999-999999999999" }));
    expect((await choose({ choice: "EXTEND" })).status).toBe(502);
    upstream.mockResolvedValue(Response.json({ ...credit, status: "MAYBE" }));
    expect((await choose({ choice: "EXTEND" })).status).toBe(502);
  });
});

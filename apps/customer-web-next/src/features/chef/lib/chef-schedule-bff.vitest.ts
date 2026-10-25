// @vitest-environment node
// Synthetic ids; no backend is contacted.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/server-api", async (original) => ({
  ...(await original<typeof import("@/shared/lib/server-api")>()),
  authenticatedApiFetch: upstream,
}));
import { GET, PUT } from "@/app/api/chef/kitchen/schedule/route";
import {
  DELETE as removeOverride,
  GET as readOverride,
  PUT as putOverride,
} from "@/app/api/chef/kitchen/schedule/overrides/[date]/route";
import {
  changeKitchenSchedule,
  deleteScheduleOverride,
  fetchScheduleOverride,
  isComingSoon,
  scheduleUpdate,
} from "@/features/chef/api/chef-kitchen-schedule";

const KITCHEN = "6b1c0000-0000-4000-8000-000000000001";
const schedule = {
  kitchenId: KITCHEN,
  timezoneId: "Asia/Kolkata",
  acceptingOrders: true,
  pausedUntil: null,
  pauseReason: null,
  weeklyWindows: [
    {
      id: "6b1c0000-0000-4000-8000-0000000000a1",
      dayOfWeek: 1,
      opensAt: "11:00:00",
      closesAt: "22:00:00",
    },
  ],
};
const week = {
  acceptingOrders: true,
  pausedUntil: "2026-10-15T12:00:00.000Z",
  pauseReason: "Paused by chef",
  weeklyWindows: [{ dayOfWeek: 1, opensAt: "11:00", closesAt: "22:00" }],
};
const override = {
  kitchenId: KITCHEN,
  serviceDate: "2026-10-20",
  closed: true,
  reason: "Diwali",
  windows: [],
};
const params = (date: string) => ({ params: Promise.resolve({ date }) });

function request(path: string, init: { method?: string; body?: unknown; origin?: string } = {}) {
  const body = init.body === undefined ? undefined : JSON.stringify(init.body);
  return new NextRequest(`https://craves.in${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(body
        ? { "content-type": "application/json", "content-length": String(body.length) }
        : {}),
      origin: init.origin ?? "https://craves.in",
    },
    body,
  });
}

beforeEach(() => {
  upstream.mockReset();
}); // braces: a returned function would run as teardown
afterEach(() => vi.unstubAllGlobals());

describe("kitchen schedule BFF", () => {
  it("reads the schedule in HH:MM without window ids", async () => {
    upstream.mockResolvedValue(Response.json(schedule));
    const response = await GET(request("/api/chef/kitchen/schedule"));
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).weeklyWindows).toEqual([
      { dayOfWeek: 1, opensAt: "11:00", closesAt: "22:00" },
    ]);
    expect(upstream.mock.calls[0][1]).toBe("/kitchens/me/schedule");
  });

  it("forwards a valid week and refuses a bad one before calling the backend", async () => {
    upstream.mockResolvedValue(Response.json(schedule));
    expect(
      (await PUT(request("/api/chef/kitchen/schedule", { method: "PUT", body: week }))).status,
    ).toBe(200);
    expect(upstream.mock.calls[0][2].method).toBe("PUT");
    expect(JSON.parse(upstream.mock.calls[0][2].body)).toEqual(week);
    upstream.mockClear();
    for (const body of [
      { ...week, weeklyWindows: [{ dayOfWeek: 1, opensAt: "22:00", closesAt: "11:00" }] },
      { ...week, pauseReason: "r".repeat(161) },
      { ...week, acceptingOrders: undefined },
      { ...week, kitchenId: KITCHEN },
      null,
    ])
      expect(
        (await PUT(request("/api/chef/kitchen/schedule", { method: "PUT", body }))).status,
      ).toBe(400);
    expect(
      (
        await PUT(
          request("/api/chef/kitchen/schedule", {
            method: "PUT",
            body: week,
            origin: "https://evil.example",
          }),
        )
      ).status,
    ).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    [new Response(null, { status: 404 }), 404, "FEATURE_NOT_AVAILABLE"],
    [Response.json({ code: "KITCHEN_NOT_FOUND" }, { status: 404 }), 404, "KITCHEN_NOT_FOUND"],
    [Response.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 }), 401, "SESSION_EXPIRED"],
    [Response.json({ code: "CHEF_ROLE_REQUIRED" }, { status: 403 }), 403, "CHEF_ROLE_REQUIRED"],
    [
      Response.json({ code: "OVERLAPPING_SERVICE_WINDOWS" }, { status: 400 }),
      400,
      "OVERLAPPING_SERVICE_WINDOWS",
    ],
    [new Response(null, { status: 500 }), 503, "KITCHEN_SCHEDULE_FAILED"],
    [
      Response.json({ ...schedule, acceptingOrders: "yes" }),
      502,
      "INVALID_KITCHEN_SCHEDULE_RESPONSE",
    ],
  ])("maps upstream %# to %s %s", async (answer, status, code) => {
    upstream.mockResolvedValue(answer);
    const response = await GET(request("/api/chef/kitchen/schedule"));
    expect([response.status, (await response.json()).code]).toEqual([status, code]);
  });

  it("answers 401 without a session and 503 when the backend can't be reached", async () => {
    const { SessionRequiredError } = await import("@/shared/lib/server-api");
    upstream
      .mockRejectedValueOnce(new SessionRequiredError("none"))
      .mockRejectedValueOnce(new Error("down"));
    expect((await GET(request("/api/chef/kitchen/schedule"))).status).toBe(401);
    expect((await GET(request("/api/chef/kitchen/schedule"))).status).toBe(503);
  });
});

describe("special day BFF", () => {
  it("reads, saves and removes a special day for a real date only", async () => {
    upstream.mockImplementation(async () => Response.json(override));
    expect(
      await (
        await readOverride(
          request("/api/chef/kitchen/schedule/overrides/2026-10-20"),
          params("2026-10-20"),
        )
      ).json(),
    ).toEqual({ serviceDate: "2026-10-20", closed: true, reason: "Diwali", windows: [] });
    expect(upstream.mock.calls[0][1]).toBe("/kitchens/me/schedule/overrides/2026-10-20");
    const saved = await putOverride(
      request("/api/chef/kitchen/schedule/overrides/2026-10-20", {
        method: "PUT",
        body: { closed: true, reason: "Diwali", windows: [] },
      }),
      params("2026-10-20"),
    );
    expect(saved.status).toBe(200);
    upstream.mockResolvedValue(new Response(null, { status: 204 }));
    expect(
      (
        await removeOverride(
          request("/api/chef/kitchen/schedule/overrides/2026-10-20", { method: "DELETE" }),
          params("2026-10-20"),
        )
      ).status,
    ).toBe(204);
    expect(upstream.mock.calls[2][2].method).toBe("DELETE");
    upstream.mockClear();
    for (const date of ["2026-02-30", "../me", "2026-10-2"]) {
      expect(
        (await readOverride(request(`/api/chef/kitchen/schedule/overrides/x`), params(date)))
          .status,
      ).toBe(400);
      expect(
        (
          await removeOverride(
            request(`/api/chef/kitchen/schedule/overrides/x`, { method: "DELETE" }),
            params(date),
          )
        ).status,
      ).toBe(400);
    }
    expect(
      (
        await putOverride(
          request("/api/chef/kitchen/schedule/overrides/2026-10-20", {
            method: "PUT",
            body: { closed: false, reason: null, windows: [] },
          }),
          params("2026-10-20"),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await removeOverride(
          request("/api/chef/kitchen/schedule/overrides/2026-10-20", {
            method: "DELETE",
            origin: "https://evil.example",
          }),
          params("2026-10-20"),
        )
      ).status,
    ).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("passes a missing special day through as 404 SCHEDULE_OVERRIDE_NOT_FOUND", async () => {
    upstream.mockResolvedValue(
      Response.json({ code: "SCHEDULE_OVERRIDE_NOT_FOUND" }, { status: 404 }),
    );
    const response = await readOverride(
      request("/api/chef/kitchen/schedule/overrides/2026-10-20"),
      params("2026-10-20"),
    );
    expect([response.status, (await response.json()).code]).toEqual([
      404,
      "SCHEDULE_OVERRIDE_NOT_FOUND",
    ]);
  });
});

describe("kitchen schedule browser calls", () => {
  const ready = {
    ...schedule,
    weeklyWindows: [{ dayOfWeek: 1, opensAt: "11:00", closesAt: "22:00" }],
  };

  it("builds a change on the schedule read just before it", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      Response.json(
        init?.method === "PUT" ? { ...ready, ...JSON.parse(String(init.body)) } : ready,
      ),
    );
    vi.stubGlobal("fetch", fetch);
    await changeKitchenSchedule(
      (fresh) =>
        scheduleUpdate(fresh, {
          pausedUntil: "2026-10-15T12:00:00.000Z",
          pauseReason: "Paused by chef",
        }),
      "x",
    );
    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method ?? "GET"])).toEqual([
      ["/api/chef/kitchen/schedule", "GET"],
      ["/api/chef/kitchen/schedule", "PUT"],
    ]);
    expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toEqual({
      acceptingOrders: true,
      pausedUntil: "2026-10-15T12:00:00.000Z",
      pauseReason: "Paused by chef",
      weeklyWindows: ready.weeklyWindows,
    });
    fetch.mockClear();
    await changeKitchenSchedule(() => null, "x");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reads a missing special day as none and a missing route as Coming soon", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ code: "SCHEDULE_OVERRIDE_NOT_FOUND" }, { status: 404 })),
    );
    expect(await fetchScheduleOverride("2026-10-20")).toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ code: "FEATURE_NOT_AVAILABLE" }, { status: 404 })),
    );
    expect(
      isComingSoon(await fetchScheduleOverride("2026-10-20").catch((error: unknown) => error)),
    ).toBe(true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    await expect(deleteScheduleOverride("2026-10-20")).resolves.toBe(true);
  });
});

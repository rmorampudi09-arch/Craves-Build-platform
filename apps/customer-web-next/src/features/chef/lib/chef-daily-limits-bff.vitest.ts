// @vitest-environment node
// Synthetic ids; no backend is contacted.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/server-api", async (original) => ({
  ...(await original<typeof import("@/shared/lib/server-api")>()),
  authenticatedApiFetch: upstream,
}));
import { GET as summary } from "@/app/api/chef/subscription-capacity/route";
import { PUT as putSlotRule } from "@/app/api/chef/subscription-capacity/rules/slots/route";
import { PUT as putDishRule } from "@/app/api/chef/subscription-capacity/rules/menu-items/route";
import { PUT as putSlotDate } from "@/app/api/chef/subscription-capacity/overrides/slots/route";
import { PUT as putDishDate } from "@/app/api/chef/subscription-capacity/overrides/menu-items/route";

const CHEF = "1d000000-0000-4000-8000-000000000001";
const DISH = "44444444-4444-4444-8444-444444444444";
const RULE = "5a000000-0000-4000-8000-000000000001";
const at = "2026-10-10T08:00:00Z";
const slotRule = {
  id: RULE,
  chefIdentityId: CHEF,
  isoDayOfWeek: 1,
  mealSlotCode: "LUNCH",
  totalCapacityUnits: 20,
  subscriptionCapacityUnits: 10,
  salesEnabled: false,
  recurringReservedUnits: 3,
  recurringAvailableUnits: 7,
  recurringDeficitUnits: 0,
  version: 2,
  updatedAt: at,
};
const dishDate = {
  id: RULE,
  chefIdentityId: CHEF,
  menuItemId: DISH,
  serviceDate: "2026-10-20",
  mealSlotCode: "LUNCH",
  maxSubscriptionUnits: 0,
  closed: true,
  reason: "x",
  heldUnits: 0,
  committedUnits: 0,
  deficitUnits: 0,
  updatedAt: at,
};
const capacity = {
  chefIdentityId: CHEF,
  adminSalesFrozen: true,
  freezeReason: "Kitchen check",
  slotRules: [slotRule],
  menuItemRules: [],
  dateOverrides: [],
  menuItemDateOverrides: [dishDate],
  openIncidentCount: 0,
};

function request(path: string, body?: unknown, origin = "https://craves.in") {
  const text = body === undefined ? undefined : JSON.stringify(body);
  return new NextRequest(`https://craves.in/api/chef/subscription-capacity${path}`, {
    method: body === undefined ? "GET" : "PUT",
    headers: {
      ...(text
        ? { "content-type": "application/json", "content-length": String(text.length) }
        : {}),
      origin,
    },
    body: text,
  });
}
const code = async (response: Response) => [response.status, (await response.json()).code];
const slotInput = {
  isoDayOfWeek: 1,
  mealSlotCode: "LUNCH",
  totalCapacityUnits: 20,
  subscriptionCapacityUnits: 10,
  salesEnabled: false,
  reason: "Updated by Chef in Craves web",
};

beforeEach(() => {
  upstream.mockReset();
});

describe("chef daily limits BFF", () => {
  it("reads limits, the freeze and booked plates; a missing route is Coming soon", async () => {
    upstream.mockResolvedValueOnce(Response.json(capacity));
    const read = await summary(request(""));
    expect(read.headers.get("cache-control")).toBe("no-store");
    expect(await read.json()).toMatchObject({
      adminSalesFrozen: true,
      freezeReason: "Kitchen check",
      slotRules: [{ recurringReservedUnits: 3 }],
    });
    upstream.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await code(await summary(request("")))).toEqual([404, "FEATURE_NOT_AVAILABLE"]);
    upstream.mockResolvedValueOnce(
      Response.json({ ...capacity, slotRules: [{ ...slotRule, subscriptionCapacityUnits: 30 }] }),
    );
    expect(await code(await summary(request("")))).toEqual([502, "INVALID_CAPACITY_RESPONSE"]);
  });

  it("saves a meal's limit with new subscribers switched off, and checks the saved rule", async () => {
    upstream.mockResolvedValueOnce(Response.json(slotRule));
    const saved = await putSlotRule(request("/rules/slots", slotInput));
    expect([saved.status, (await saved.json()).salesEnabled]).toEqual([200, false]);
    expect([upstream.mock.calls[0][1], JSON.parse(upstream.mock.calls[0][2].body)]).toEqual([
      "/chef/subscription-capacity/rules/slots",
      slotInput,
    ]);
    upstream.mockResolvedValueOnce(Response.json({ ...slotRule, version: 0 }));
    expect(await code(await putSlotRule(request("/rules/slots", slotInput)))).toEqual([
      502,
      "INVALID_CAPACITY_RESPONSE",
    ]);
  });

  it("refuses bad limits and cross-site writes before calling Craves", async () => {
    for (const body of [
      { ...slotInput, subscriptionCapacityUnits: 21 },
      { ...slotInput, totalCapacityUnits: 100_001 },
      { ...slotInput, isoDayOfWeek: 8 },
      { ...slotInput, reason: " " },
    ]) {
      expect((await putSlotRule(request("/rules/slots", body))).status).toBe(400);
    }
    expect(
      (await putSlotRule(request("/rules/slots", slotInput, "https://evil.example"))).status,
    ).toBe(403);
    expect(
      (
        await putDishRule(
          request("/rules/menu-items", {
            menuItemId: "nope",
            isoDayOfWeek: 1,
            mealSlotCode: "LUNCH",
            maxSubscriptionUnits: 5,
            salesEnabled: true,
            reason: "x",
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await putSlotDate(
          request("/overrides/slots", {
            serviceDate: "20-10-2026",
            mealSlotCode: "LUNCH",
            totalCapacityUnits: 5,
            subscriptionCapacityUnits: 5,
            closed: true,
            reason: "x",
          }),
        )
      ).status,
    ).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("closes one dish for one date and keeps Craves' own reason when it refuses", async () => {
    const input = {
      menuItemId: DISH,
      serviceDate: "2026-10-20",
      mealSlotCode: "LUNCH",
      maxSubscriptionUnits: 0,
      closed: true,
      reason: "Dish date override updated by Chef in Craves web",
    };
    upstream.mockResolvedValueOnce(Response.json(dishDate));
    expect((await putDishDate(request("/overrides/menu-items", input))).status).toBe(200);
    expect(JSON.parse(upstream.mock.calls[0][2].body)).toEqual(input);
    upstream.mockResolvedValueOnce(
      Response.json(
        { code: "CAPACITY_SALES_FROZEN", message: "Subscription sales are frozen" },
        { status: 409 },
      ),
    );
    const refused = await putDishDate(request("/overrides/menu-items", input));
    expect([refused.status, await refused.json()]).toEqual([
      409,
      {
        code: "CAPACITY_SALES_FROZEN",
        message: "Subscription sales are frozen",
        reason: "CAPACITY_SALES_FROZEN",
      },
    ]);
  });
});

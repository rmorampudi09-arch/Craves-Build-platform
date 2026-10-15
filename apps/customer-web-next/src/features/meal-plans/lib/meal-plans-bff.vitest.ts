// @vitest-environment node
// Synthetic ids; no backend is contacted.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const publicUpstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/public-api", () => ({ publicApiFetch: publicUpstream }));
import { GET as listPlans } from "@/app/api/subscriptions/plans/route";

const PLAN = "11111111-1111-4111-8111-111111111111";
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

beforeEach(() => {
  publicUpstream.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("meal plan list BFF", () => {
  it("keeps 14-day plans and drops a malformed one instead of failing the list", async () => {
    const fortnightly = {
      ...plan,
      id: "33333333-3333-4333-8333-333333333333",
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

  it("answers 502 only when the list itself is not a list", async () => {
    publicUpstream.mockResolvedValue(Response.json({ plans: [plan] }));
    const response = await listPlans(new NextRequest("https://craves.in/api/subscriptions/plans"));
    expect([response.status, (await response.json()).code]).toEqual([
      502,
      "INVALID_SUBSCRIPTION_PLANS_RESPONSE",
    ]);
  });
});

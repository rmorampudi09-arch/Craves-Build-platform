import { describe, expect, it } from "vitest";
import TrackingRoute from "@/app/tracking/page";

const ORDER_ID = "11111111-2222-4333-8444-555555555555";

async function redirectTarget(id?: string | string[]) {
  try {
    await TrackingRoute({ searchParams: Promise.resolve({ id }) });
  } catch (error) {
    return String((error as { digest?: string }).digest).split(";")[2];
  }
  throw new Error("expected a redirect");
}

describe("/tracking", () => {
  it("sends a valid order id to the single tracking page", async () => {
    expect(await redirectTarget(ORDER_ID)).toBe(`/orders/${ORDER_ID}/tracking`);
  });

  it("keeps the old fallback to the orders list otherwise", async () => {
    expect(await redirectTarget("not-an-order")).toBe("/orders");
    expect(await redirectTarget(undefined)).toBe("/orders");
    expect(await redirectTarget([ORDER_ID, ORDER_ID])).toBe("/orders");
  });
});

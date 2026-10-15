// @vitest-environment jsdom
// Synthetic orders and payouts; no backend is contacted.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChefEarning } from "@/features/chef/lib/chef-earnings-contract";
import { ChefEarningsInsights } from "./chef-earnings-insights";
import { ChefPayoutHistory } from "./chef-payout-history";

vi.mock("next/link", async () => {
  const { createElement: create } = await import("react");
  return { default: ({ href, children, ...rest }: { href: string; children: unknown }) => create("a", { href, ...rest }, children) };
});

const ORDER_ID = "7f6392a6-1111-4222-8333-444444444444";
const earning = (createdAt: string, netPayable: number): ChefEarning => ({
  id: crypto.randomUUID(), orderId: ORDER_ID, orderSource: "ON_DEMAND", currency: "INR", grossAmount: netPayable, commissionAmount: 0, taxWithheldAmount: 0,
  adjustmentAmount: 0, netPayable, allocationReference: "ref", status: "APPROVED", reason: "", approvedAt: null, reversedAt: null, createdAt, updatedAt: createdAt,
});
const order = {
  id: ORDER_ID, kitchenName: "Home Kitchen", status: "DELIVERED", currency: "INR", foodSubtotal: 360, platformFee: 0, taxAmount: 0, deliveryFee: 0, grandTotal: 360,
  items: [{ id: "8f000000-0000-4000-8000-000000000001", menuItemId: "9f000000-0000-4000-8000-000000000001", itemName: "Chicken biryani", unitPrice: 180, quantity: 2, lineTotal: 360 }],
  createdAt: "2026-10-14T05:00:00Z", updatedAt: "2026-10-14T06:00:00Z",
};
const routes = vi.fn<(path: string) => Response>();

beforeEach(() => {
  routes.mockReset();
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-15T04:30:00Z") });
  vi.stubGlobal("fetch", vi.fn(async (path: string) => routes(path)));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("earnings insights", () => {
  it("sums the week, compares it, and lists a day's orders from its bar", async () => {
    routes.mockImplementation((path) =>
      path === "/api/chef/orders" ? Response.json([order])
        : path.startsWith("/api/chef/orders/page") ? Response.json({ orders: [], nextCursor: null, hasMore: false })
          : Response.json([]),
    );
    const entries = [earning("2026-10-14T06:00:00Z", 300), earning("2026-10-05T06:00:00Z", 200)];
    render(createElement(ChefEarningsInsights, { entries, loading: false, failed: false, onRetry: vi.fn() }));
    expect(await screen.findAllByText("₹300.00")).toHaveLength(2); // earned and the average order
    expect(screen.getByText("50% vs last week")).toBeTruthy();
    expect(screen.getByText("Chicken biryani")).toBeTruthy();
    expect(screen.getByText("2 sold")).toBeTruthy();
    expect(screen.getByText("Showing your latest orders only.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Yesterday, ₹300.00" }));
    const sheet = await screen.findByRole("dialog", { name: "Orders · Yesterday" });
    expect(within(sheet).getByRole("link").getAttribute("href")).toBe(`/chef/orders/${ORDER_ID}`);
    expect(within(sheet).getByText("#7F6392A6")).toBeTruthy();
  });

  it("switches period and keeps working when older orders are not published", async () => {
    routes.mockImplementation((path) =>
      path === "/api/chef/orders" ? Response.json([])
        : path.startsWith("/api/chef/orders/page") ? Response.json({ code: "FEATURE_NOT_AVAILABLE" }, { status: 404 })
          : Response.json([]),
    );
    render(createElement(ChefEarningsInsights, { entries: [earning("2026-10-01T06:00:00Z", 120)], loading: false, failed: false, onRetry: vi.fn() }));
    expect(await screen.findByText("No sales this week")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "This month" }));
    expect(screen.getAllByText("₹120.00").length).toBeGreaterThan(0);
    expect(screen.getByText("Orders this month")).toBeTruthy();
  });

  it("asks to try again when the orders don't load", async () => {
    routes.mockImplementation(() => Response.json({ code: "CHEF_ORDERS_REQUEST_FAILED" }, { status: 503 }));
    render(createElement(ChefEarningsInsights, { entries: [], loading: false, failed: false, onRetry: vi.fn() }));
    expect(await screen.findByText("We couldn’t load your orders.")).toBeTruthy();
  });
});

describe("payout history", () => {
  const payout = (id: string, createdAt: string, status: string, transferReference: string | null) => ({ id, amount: "1250.00", mode: "MANUAL", status, payoutChannel: "CRAVES_MANUAL", providerStatus: null, transferReference, createdAt });
  const balance = (recentPayouts: unknown[]) => ({ available: "0.00", outstanding: "0.00", reservedOrPaid: "0.00", onHold: false, manualRequestUsedToday: false, nextManualRequestAt: "2026-10-16T00:00:00Z", recentPayouts, executionEnabled: true, payoutMode: "CRAVES_MANUAL" });

  it("groups payouts by month and opens the details", async () => {
    routes.mockReturnValue(Response.json(balance([
      payout("a1000000-0000-4000-8000-000000000001", "2026-09-20T08:00:00Z", "FAILED", null),
      payout("a1000000-0000-4000-8000-000000000002", "2026-10-15T03:00:00Z", "PAID", "UTR123"),
    ])));
    render(createElement(ChefPayoutHistory));
    const [october, september] = await screen.findAllByRole("heading", { level: 2 });
    expect([october.textContent, september.textContent]).toEqual(["October", "September"]);
    fireEvent.click(screen.getByText("Requested today, 8:30 am").closest("button")!);
    const sheet = await screen.findByRole("dialog", { name: "Payout details" });
    expect(within(sheet).getByText("UTR123")).toBeTruthy();
    expect(within(sheet).getByText("The money has reached your bank.")).toBeTruthy();
  });

  it("shows the empty and failed states", async () => {
    routes.mockReturnValue(Response.json(balance([])));
    render(createElement(ChefPayoutHistory));
    expect(await screen.findByText("No payouts yet")).toBeTruthy();
    cleanup();
    routes.mockReturnValue(Response.json({ code: "FINANCE_UNAVAILABLE" }, { status: 503 }));
    render(createElement(ChefPayoutHistory));
    expect(await screen.findByText("We couldn’t load your payouts.")).toBeTruthy();
  });
});

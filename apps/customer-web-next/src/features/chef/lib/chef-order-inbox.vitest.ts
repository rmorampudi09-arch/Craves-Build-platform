// @vitest-environment jsdom
// Synthetic orders for a fixture kitchen; no backend is contacted.
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChefOrderInbox } from "../components/chef-order-inbox";
import { resetOrderAlertsForTests } from "./chef-order-alert";
import type { ChefOrder } from "./chef-order-contract";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/chef/orders"),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function order(n: number, status: ChefOrder["status"] = "DELIVERED"): ChefOrder {
  const id = `0bde010${n}-0000-4000-8000-00000000010${n}`;
  return {
    id,
    kitchenName: "Fixture Kitchen",
    status,
    currency: "INR",
    foodSubtotal: 298,
    platformFee: 9,
    taxAmount: 15,
    deliveryFee: 39,
    grandTotal: 361,
    chefResponseNote: null,
    prepTimeMinutes: null,
    deliveryAddress: null,
    items: [],
    createdAt: `2026-10-0${n}T08:00:00Z`,
    updatedAt: `2026-10-0${n}T09:00:00Z`,
  };
}
// The first render loads the live list, then the first page: give a busy test machine time.
const slow = { timeout: 5_000 };
const rows = () =>
  screen.getAllByRole("link").map((link) => link.textContent?.match(/#(\w{8})/)?.[1]);

let live: ChefOrder[];
let pages: Record<string, Response | (() => Response)>;
beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  resetOrderAlertsForTests();
  live = [order(5)];
  pages = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/chef/orders") return Response.json(live);
      const page = pages[url];
      return typeof page === "function" ? page() : (page ?? Response.json({}, { status: 404 }));
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Past orders", () => {
  it("adds older orders page by page, every finished kind, and keeps the live copy of an order in both", async () => {
    pages["/api/chef/orders/page?limit=20"] = Response.json({
      orders: [order(5, "OUT_FOR_DELIVERY"), order(3), order(4, "CHEF_REJECTED"), order(2, "PAYMENT_PENDING")],
      nextCursor: "c2",
      hasMore: true,
    });
    pages["/api/chef/orders/page?limit=20&cursor=c2"] = Response.json({
      orders: [order(1)],
      nextCursor: null,
      hasMore: false,
    });
    render(createElement(ChefOrderInbox));
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }, slow));
    await waitFor(() => expect(rows()).toEqual(["0BDE0105", "0BDE0104", "0BDE0103", "0BDE0101"]));
    expect(screen.getByRole("button", { name: /^Past/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("keeps the recent orders and says older ones are coming soon while the server has no paging", async () => {
    pages["/api/chef/orders/page?limit=20"] = Response.json(
      { code: "FEATURE_NOT_AVAILABLE" },
      { status: 404 },
    );
    render(createElement(ChefOrderInbox));
    expect(await screen.findByText("Older orders are coming soon.", {}, slow)).toBeTruthy();
    expect(rows()).toEqual(["0BDE0105"]);
  });

  it("offers Try again when a page fails", async () => {
    let attempts = 0;
    pages["/api/chef/orders/page?limit=20"] = () =>
      ++attempts === 1
        ? Response.json({ code: "CHEF_ORDER_HISTORY_FAILED" }, { status: 503 })
        : Response.json({ orders: [order(2)], nextCursor: null, hasMore: false });
    render(createElement(ChefOrderInbox));
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }, slow));
    await waitFor(() => expect(rows()).toEqual(["0BDE0105", "0BDE0102"]));
  });

  it("reaches past orders when nothing is live", async () => {
    live = [];
    pages["/api/chef/orders/page?limit=20"] = Response.json({
      orders: [order(2)],
      nextCursor: null,
      hasMore: false,
    });
    render(createElement(ChefOrderInbox));
    expect(await screen.findByRole("heading", { name: "No new orders" }, slow)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Past/ }));
    await waitFor(() => expect(rows()).toEqual(["0BDE0102"]));
  });
});

describe("tabs", () => {
  it("are New, Cooking, Ready and Past, open on the first with orders, and count no unpaid order", async () => {
    live = [order(9, "PAYMENT_PENDING"), order(8, "READY_FOR_PICKUP"), order(7, "REFUNDED"), order(6, "CANCELLED"), order(5)];
    pages["/api/chef/orders/page?limit=20"] = Response.json({ orders: [], nextCursor: null, hasMore: false });
    render(createElement(ChefOrderInbox));
    const tabs = await screen.findByRole("navigation", { name: "Choose which orders to see" }, slow);
    expect(within(tabs).getAllByRole("button").map((tab) => tab.textContent)).toEqual(["New", "Cooking", "Ready1", "Past"]);
    // The inbox picks its opening tab in an effect after the tabs first render.
    await waitFor(() => expect(screen.getByRole("button", { name: /^Ready/ }).getAttribute("aria-pressed")).toBe("true"), slow);
    fireEvent.click(screen.getByRole("button", { name: /^Past/ }));
    await waitFor(() => expect(rows()).toEqual(["0BDE0107", "0BDE0106", "0BDE0105"]), slow);
  });

  it("shows an empty New tab when the only orders are unpaid", async () => {
    live = [order(6, "PAYMENT_PENDING"), order(7, "PAID")];
    render(createElement(ChefOrderInbox));
    expect(await screen.findByRole("heading", { name: "No new orders" }, slow)).toBeTruthy();
    const tabs = screen.getByRole("navigation", { name: "Choose which orders to see" });
    expect(within(tabs).getAllByRole("button").map((tab) => tab.textContent)).toEqual(["New", "Cooking", "Ready", "Past"]);
  });

  it("moves a picked-up order to Past, where chips and day groups sort it", async () => {
    live = [order(8, "OUT_FOR_DELIVERY"), order(7, "CHEF_REJECTED"), order(6)];
    pages["/api/chef/orders/page?limit=20"] = Response.json({ orders: [], nextCursor: null, hasMore: false });
    render(createElement(ChefOrderInbox));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Past/ }).getAttribute("aria-pressed")).toBe("true"), slow);
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "8 Oct · 1 order · ₹298", "7 Oct · 1 order", "6 Oct · 1 order · ₹298",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "On the way" }));
    expect(rows()).toEqual(["0BDE0108"]);
    fireEvent.click(screen.getByRole("button", { name: "Cancelled" }));
    expect(await screen.findByRole("heading", { name: "No orders here" })).toBeTruthy();
  });
});

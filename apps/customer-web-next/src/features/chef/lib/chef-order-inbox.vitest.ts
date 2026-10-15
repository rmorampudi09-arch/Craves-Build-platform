// @vitest-environment jsdom
// Synthetic orders for a fixture kitchen; no backend is contacted.
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("Done orders", () => {
  it("adds older orders page by page and keeps the live copy of an order in both", async () => {
    pages["/api/chef/orders/page?limit=20&status=DELIVERED"] = Response.json({
      orders: [order(5, "OUT_FOR_DELIVERY"), order(3), order(4, "CHEF_REJECTED")],
      nextCursor: "c2",
      hasMore: true,
    });
    pages["/api/chef/orders/page?limit=20&cursor=c2&status=DELIVERED"] = Response.json({
      orders: [order(1)],
      nextCursor: null,
      hasMore: false,
    });
    render(createElement(ChefOrderInbox));
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }, slow));
    await waitFor(() => expect(rows()).toEqual(["0BDE0105", "0BDE0103", "0BDE0101"]));
    expect(screen.getByRole("button", { name: /^Done/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("keeps the recent orders and says older ones are coming soon while the server has no paging", async () => {
    pages["/api/chef/orders/page?limit=20&status=DELIVERED"] = Response.json(
      { code: "FEATURE_NOT_AVAILABLE" },
      { status: 404 },
    );
    render(createElement(ChefOrderInbox));
    expect(await screen.findByText("Older orders are coming soon.", {}, slow)).toBeTruthy();
    expect(rows()).toEqual(["0BDE0105"]);
  });

  it("offers Try again when a page fails", async () => {
    let attempts = 0;
    pages["/api/chef/orders/page?limit=20&status=DELIVERED"] = () =>
      ++attempts === 1
        ? Response.json({ code: "CHEF_ORDER_HISTORY_FAILED" }, { status: 503 })
        : Response.json({ orders: [order(2)], nextCursor: null, hasMore: false });
    render(createElement(ChefOrderInbox));
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }, slow));
    await waitFor(() => expect(rows()).toEqual(["0BDE0105", "0BDE0102"]));
  });

  it("reaches past orders when nothing is live", async () => {
    live = [];
    pages["/api/chef/orders/page?limit=20&status=DELIVERED"] = Response.json({
      orders: [order(2)],
      nextCursor: null,
      hasMore: false,
    });
    render(createElement(ChefOrderInbox));
    fireEvent.click(await screen.findByRole("button", { name: "See past orders" }, slow));
    await waitFor(() => expect(rows()).toEqual(["0BDE0102"]));
  });
});

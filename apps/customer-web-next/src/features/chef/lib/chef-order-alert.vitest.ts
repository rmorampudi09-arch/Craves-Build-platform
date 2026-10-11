// @vitest-environment jsdom
// Synthetic orders for a fixture kitchen; no backend is contacted.
import { createElement } from "react";
import { usePathname } from "next/navigation";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChefOrderWatcher } from "../components/chef-order-watcher";
import { ChefOrderInbox } from "../components/chef-order-inbox";
import { fetchChefOrders, mergeOrders, noticeNewOrders, orderWords, resetOrderAlertsForTests, writeAlertPrefs } from "./chef-order-alert";
import type { ChefOrder } from "./chef-order-contract";
import { markChefModeVerified } from "./chef-mode";
import { captureSessionContext, invalidateSession, setSessionIdentity } from "../../auth/api/cravesAuth";
import type { CravesIdentity } from "../../auth/lib/auth-contract";

vi.mock("next/navigation", () => ({ usePathname: vi.fn(() => "/chef/menu"), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

function order(id: string, status: ChefOrder["status"], updatedAt = "2026-10-10T08:01:00Z"): ChefOrder {
  return {
    id, kitchenName: "Fixture Kitchen", status, currency: "INR", foodSubtotal: 807, platformFee: 9, taxAmount: 40.35,
    deliveryFee: 39, grandTotal: 895.35, chefResponseNote: null, prepTimeMinutes: null, deliveryAddress: null,
    items: [{ id: `${id.slice(0, -4)}1011`, menuItemId: "d15b0000-0000-4000-8000-000000000004", itemName: "Rasmalai (4 pcs)", category: "Desserts", foodType: "VEG", unitPrice: 149, quantity: 2, lineTotal: 298 }],
    createdAt: "2026-10-10T08:01:00Z", updatedAt,
  };
}
const A = "0bde0000-0000-4000-8000-000000000101";
const B = "0bde0000-0000-4000-8000-000000000102";

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  resetOrderAlertsForTests();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("new-order alerts", () => {
  it("stays quiet on the first look, then buzzes once for each new waiting order", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, vibrate });
    expect(noticeNewOrders([order(A, "CHEF_ACCEPTANCE_PENDING")])).toEqual([]);
    expect(vibrate).not.toHaveBeenCalled();

    expect(noticeNewOrders([order(A, "CHEF_ACCEPTANCE_PENDING"), order(B, "CHEF_ACCEPTANCE_PENDING")]).map((o) => o.id)).toEqual([B]);
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(noticeNewOrders([order(A, "CHEF_ACCEPTANCE_PENDING"), order(B, "CHEF_ACCEPTANCE_PENDING")])).toEqual([]);
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it("keeps quiet when the chef turned ringing off, and never alerts for orders already being cooked", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, vibrate });
    noticeNewOrders([]);
    writeAlertPrefs({ ring: false, speak: false });
    expect(noticeNewOrders([order(A, "CHEF_ACCEPTANCE_PENDING")])).toHaveLength(1);
    expect(noticeNewOrders([order(B, "PREPARING")])).toEqual([]);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("keeps the chef's own newer copy when an older check comes back, and reads pieces aloud plainly", () => {
    const mine = order(A, "PREPARING", "2026-10-10T08:05:00Z");
    const merged = mergeOrders([mine], [order(A, "CHEF_ACCEPTANCE_PENDING"), order(B, "CHEF_ACCEPTANCE_PENDING")]);
    expect(merged.map((o) => [o.id, o.status])).toEqual([[A, "PREPARING"], [B, "CHEF_ACCEPTANCE_PENDING"]]);
    expect(orderWords(order(A, "CHEF_ACCEPTANCE_PENDING"), "New order")).toBe("New order. 2 Rasmalai 4 pieces.");
  });
});

describe("order watcher on pages without an order list", () => {
  const chef: CravesIdentity = { id: "61111111-1111-4111-8111-111111111111", phoneNumber: "+910000000002", displayName: "Asha Rao", email: null, emailVerified: false, status: "ACTIVE", roles: ["CUSTOMER", "CHEF"] };
  beforeEach(() => {
    setSessionIdentity(chef);
    markChefModeVerified(chef.id);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input) === "/api/chef/orders"
      ? Response.json([order(A, "CHEF_ACCEPTANCE_PENDING"), order(B, "PREPARING")])
      : Response.json({}, { status: 404 })));
  });
  afterEach(() => invalidateSession(captureSessionContext()));

  it("shows the waiting order on Menu and links straight to it", async () => {
    vi.mocked(usePathname).mockReturnValue("/chef/menu");
    render(createElement(ChefOrderWatcher));
    const link = await screen.findByRole("link", { name: /New order waiting/ });
    expect(link.getAttribute("href")).toBe(`/chef/orders/${A}`);
  });

  it("leaves Home and Orders to their own lists", async () => {
    vi.mocked(usePathname).mockReturnValue("/chef/orders");
    render(createElement(ChefOrderWatcher));
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(screen.queryByRole("link", { name: /New order waiting/ })).toBeNull();
    expect(vi.mocked(fetch)).not.toHaveBeenCalledWith("/api/chef/orders", expect.anything());
  });

  it("on an order's own page, shows only other waiting orders", async () => {
    vi.mocked(usePathname).mockReturnValue(`/chef/orders/${A}`);
    render(createElement(ChefOrderWatcher));
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/chef/orders", expect.anything()));
    await act(async () => {});
    expect(screen.queryByRole("link", { name: /New order waiting/ })).toBeNull();
  });

  it("tells screen readers about an order that arrives later, on any chef page", async () => {
    vi.mocked(usePathname).mockReturnValue("/chef/earnings");
    render(createElement(ChefOrderWatcher));
    await screen.findByRole("link", { name: /New order waiting/ });
    expect(screen.getByRole("status").textContent).toBe("");
    vi.mocked(fetch).mockImplementation(async (input) => String(input) === "/api/chef/orders"
      ? Response.json([order(A, "CHEF_ACCEPTANCE_PENDING"), order(B, "CHEF_ACCEPTANCE_PENDING")])
      : Response.json({}, { status: 404 }));
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/^New order 000102\. 2 Rasmalai 4 pieces\.$/));
    expect(screen.getByRole("link", { name: /2 new orders waiting/ }).getAttribute("href")).toBe("/chef");
  });
});

describe("orders keep working when the sign-in cookie expires", () => {
  it("refreshes the cookie, and hands a refused refresh to the session", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return Response.json({ code: "SESSION_EXPIRED" }, { status: 401 });
    }));
    expect(await fetchChefOrders()).toBeNull();
    expect(calls.slice(0, 2)).toEqual(["/api/chef/orders", "/api/auth/refresh"]);
    await waitFor(() => expect(calls).toContain("/api/auth/me"));
  });
});

describe("Orders screen", () => {
  const C = "0bde0000-0000-4000-8000-000000000103";
  let list: ChefOrder[];
  beforeEach(() => {
    list = [order(A, "CHEF_ACCEPTANCE_PENDING"), order(B, "DELIVERED")];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/chef/orders") return Response.json(list);
      if (url === `/api/chef/orders/${A}/accept` && init?.method === "POST") {
        const prep = JSON.parse(String(init.body)).prepTimeMinutes;
        return Response.json({ ...order(A, "CHEF_ACCEPTED", "2026-10-10T08:06:00Z"), prepTimeMinutes: prep });
      }
      return Response.json({}, { status: 404 });
    }));
  });

  it("never moves the chef off the tab they chose when new orders arrive", async () => {
    render(createElement(ChefOrderInbox));
    await screen.findByRole("heading", { name: /Order #000101/ });
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    list = [order(C, "CHEF_ACCEPTANCE_PENDING"), ...list];
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(screen.getByRole("button", { name: /^New/ }).textContent).toContain("2"));
    expect(screen.getByRole("button", { name: /^All/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("says what happened after Accept, follows the order to Cooking and keeps focus on it", async () => {
    render(createElement(ChefOrderInbox));
    fireEvent.click(await screen.findByRole("button", { name: "Accept order" }));
    fireEvent.click(screen.getByText("45"));
    fireEvent.click(screen.getByRole("button", { name: "Start cooking" }));
    await screen.findByText("Order #000101 accepted. Start cooking: ready in about 45 min.");
    expect(screen.getByRole("button", { name: /^Cooking/ }).getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(document.activeElement?.id).toBe(`chef-order-${A}`));
    expect(screen.getByRole("button", { name: "Food is ready for pickup" })).toBeTruthy();
  });
});

// @vitest-environment jsdom
// Synthetic orders for a fixture kitchen; no backend is contacted.
import { createElement } from "react";
import { usePathname } from "next/navigation";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChefOrderWatcher } from "../components/chef-order-watcher";
import { mergeOrders, noticeNewOrders, orderWords, resetOrderAlertsForTests, writeAlertPrefs } from "./chef-order-alert";
import type { ChefOrder } from "./chef-order-contract";
import { markChefModeVerified } from "./chef-mode";
import { captureSessionContext, invalidateSession, setSessionIdentity } from "../services/auth/cravesAuth";
import type { CravesIdentity } from "./auth-contract";

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
    const { container } = render(createElement(ChefOrderWatcher));
    await waitFor(() => expect(container.innerHTML).toBe(""));
    expect(vi.mocked(fetch)).not.toHaveBeenCalledWith("/api/chef/orders", expect.anything());
  });
});

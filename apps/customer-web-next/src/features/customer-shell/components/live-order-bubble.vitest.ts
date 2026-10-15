// @vitest-environment jsdom
// Synthetic orders; no backend is contacted.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  user: null as { id: string } | null,
  listeners: new Set<() => void>(),
  // What /api/auth/me answers when the bubble asks.
  signedIn: null as { id: string } | null,
  load: vi.fn(),
}));
vi.mock("@/features/auth/api/cravesAuth", () => ({
  getSession: () => session.user,
  subscribeSession: (listener: () => void) => {
    session.listeners.add(listener);
    return () => session.listeners.delete(listener);
  },
  recoverSessionSnapshotForNavigation: () => session.user,
  loadSession: session.load,
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) =>
    createElement("a", { href, ...rest }, children),
}));

import { LiveOrderBubble } from "./LiveOrderBubble";

const LIVE = "7f6392a6-1111-4111-8111-111111111111";
const PHOTO = "https://craves.in/media/public/dishes/veg-thali.jpg";
function order(id: string, status: string) {
  const at = new Date(Date.now() - 20 * 60_000).toISOString();
  return {
    id,
    kitchenName: "Relangi",
    status,
    currency: "INR",
    grandTotal: 248.5,
    createdAt: at,
    updatedAt: at,
    items: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        menuItemId: "66666666-6666-4666-8666-666666666666",
        itemName: "Veg thali",
        quantity: 2,
        lineTotal: 240,
      },
    ],
  };
}
const fetchOrders = vi.fn();
const bubble = () => screen.queryByRole("button", { name: /^Live order from Relangi/ });
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

beforeEach(() => {
  fetchOrders.mockReset();
  session.load.mockReset();
  session.load.mockImplementation(async () => {
    session.user = session.signedIn;
    session.listeners.forEach((listener) => listener());
    return session.user;
  });
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchOrders);
  session.user = { id: "customer-1" };
  session.signedIn = null;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("live order bubble", () => {
  it("stays away from signed-out visitors", async () => {
    session.user = null;
    render(createElement(LiveOrderBubble, { pathname: "/home" }));
    await settle();
    expect(session.load).toHaveBeenCalledWith({ failFastUnauthenticated: true });
    expect(fetchOrders).not.toHaveBeenCalled();
    expect(bubble()).toBeNull();
  });

  it("loads the session itself on a page that doesn't", async () => {
    session.user = null;
    session.signedIn = { id: "customer-1" };
    fetchOrders.mockResolvedValue(Response.json([order(LIVE, "PREPARING")]));
    render(createElement(LiveOrderBubble, { pathname: "/subscriptions" }));
    await settle();
    expect(bubble()).not.toBeNull();
  });

  it("grows the newest live order's card with its steps, items, amount paid, order and help links", async () => {
    fetchOrders.mockImplementation(async (url: string) =>
      url === "/api/orders"
        ? Response.json([
            order(LIVE, "READY_FOR_PICKUP"),
            order("bbbbbbbb-1111-4111-8111-111111111111", "DELIVERED"),
          ])
        : Response.json({ primaryImageUrl: PHOTO }),
    );
    render(createElement(LiveOrderBubble, { pathname: "/home" }));
    await settle();
    expect(session.load).not.toHaveBeenCalled();
    expect(fetchOrders).toHaveBeenCalledWith(
      "/api/orders",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(bubble()!.getAttribute("aria-label")).toBe("Live order from Relangi, Ready. Open order");

    fireEvent.click(bubble()!);
    const card = screen.getByRole("dialog", { name: "Ready for pickup" });
    expect(card.textContent).toContain("Relangi · Order #7F6392A6");
    expect(screen.getByRole("list", { name: "Order progress" }).textContent).toBe(
      "AcceptedCookedOn the wayDelivered",
    );
    expect(screen.getByText("Cooked").closest("li")!.getAttribute("aria-current")).toBe("step");
    expect(card.textContent).toContain("Veg thali × 2");
    expect(card.textContent).toContain("₹240");
    expect(card.textContent).toContain("Paid ₹248.50");
    await settle();
    expect(fetchOrders).toHaveBeenCalledWith(
      "/api/catalog/menu-items/66666666-6666-4666-8666-666666666666",
    );
    expect(card.querySelector("img")?.getAttribute("src")).toBe(PHOTO);
    expect(screen.getByRole("link", { name: "View order details" }).getAttribute("href")).toBe(
      `/orders/${LIVE}`,
    );
    expect(
      screen.getByRole("link", { name: "Get help with this order" }).getAttribute("href"),
    ).toBe(`/support?orderId=${LIVE}`);
  });

  it("hides on that order's own page", async () => {
    fetchOrders.mockResolvedValue(Response.json([order(LIVE, "PREPARING")]));
    render(createElement(LiveOrderBubble, { pathname: `/orders/${LIVE}/tracking` }));
    await settle();
    expect(fetchOrders).toHaveBeenCalledTimes(1);
    expect(bubble()).toBeNull();
  });

  it("polls every 30 s while an order is live, pauses while the tab is hidden and stops once none is", async () => {
    fetchOrders.mockImplementation(async () => Response.json([order(LIVE, "OUT_FOR_DELIVERY")]));
    render(createElement(LiveOrderBubble, { pathname: "/home" }));
    await settle();
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(fetchOrders).toHaveBeenCalledTimes(2);

    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(fetchOrders).toHaveBeenCalledTimes(2);
    visibility.mockReturnValue("visible");
    // Back in view: one read at once, the order has since been delivered.
    fetchOrders.mockImplementation(async () => Response.json([order(LIVE, "DELIVERED")]));
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchOrders).toHaveBeenCalledTimes(3);
    expect(bubble()).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(90_000));
    expect(fetchOrders).toHaveBeenCalledTimes(3);
  });

  it("keeps the bubble through a failed read (order-service answers those with 403)", async () => {
    fetchOrders
      .mockResolvedValueOnce(Response.json([order(LIVE, "CHEF_ACCEPTED")]))
      .mockResolvedValue(new Response(null, { status: 403 }));
    render(createElement(LiveOrderBubble, { pathname: "/home" }));
    await settle();
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(fetchOrders).toHaveBeenCalledTimes(2);
    expect(bubble()).not.toBeNull();
  });
});

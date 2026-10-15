// @vitest-environment jsdom
// The page checkout lands on after payment. Synthetic owned orders; no network or customer mutations.
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { CustomerOrderStatus } from "../components/CustomerOrderStatus";

const fixture = vi.hoisted(() => ({
  id: "0bde0000-0000-4000-8000-000000000010",
  kitchen: "0bde0000-0000-4000-8000-000000000020",
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: fixture.push, replace: vi.fn() }) }));
vi.mock("../components/TrackingHeader", () => ({
  TrackingHeader: ({ title }: { title: string }) => createElement("header", null, createElement("h1", null, title)),
}));
// No WebGL here: the map is a labelled box that keeps its overlays.
vi.mock("../components/OrderMap", async (original) => ({
  ...(await original<typeof import("../components/OrderMap")>()),
  OrderMap: ({ label, children }: { label: string; children?: ReactNode }) =>
    createElement("div", { "data-testid": "order-map", "data-label": label }, children),
}));

function order(status: string, overrides: Record<string, unknown> = {}) {
  return {
    id: fixture.id,
    checkoutId: fixture.id,
    kitchenId: fixture.kitchen,
    kitchenName: "Ammi's Dastarkhwan",
    status,
    currency: "INR",
    foodSubtotal: 1026,
    platformFee: 9,
    taxAmount: 51.3,
    deliveryFee: 39,
    grandTotal: 1125.3,
    chefResponseNote: null,
    prepTimeMinutes: null,
    deliveryAddress: {
      recipientName: "Priya",
      addressLine1: "Flat 302, Sri Sai Residency",
      addressLine2: null,
      landmark: null,
      areaName: "Banjara Hills",
      city: "Hyderabad",
      state: "Telangana",
      postalCode: "500034",
    },
    items: [
      {
        id: "0bde0000-0000-4000-8000-000000000031",
        menuItemId: "0bde0000-0000-4000-8000-000000000041",
        itemName: "Hyderabadi Chicken Dum Biryani",
        category: "Biryani",
        foodType: "NON_VEG",
        unitPrice: 329,
        quantity: 2,
        lineTotal: 658,
      },
    ],
    createdAt: "2026-10-10T08:04:00Z",
    updatedAt: "2026-10-10T08:05:00Z",
    ...overrides,
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** The order at its own URL; the delivery, kitchen and menu reads get what `extra` gives them, else a 404. */
function serve(body: unknown, status = 200, extra: Record<string, unknown> = {}) {
  const fetch = vi.fn(async (url: string) => {
    if (url === `/api/orders/${fixture.id}`) return json(body, status);
    const key = Object.keys(extra).find((suffix) => url.endsWith(suffix));
    return key ? json(extra[key]) : json({ code: "NOT_FOUND" }, 404);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
const orderCalls = (fetch: ReturnType<typeof serve>) => fetch.mock.calls.filter(([url]) => url === `/api/orders/${fixture.id}`).length;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("order status after payment", () => {
  it("confirms the order, says what happens next and keeps the paise in the bill", async () => {
    serve(order("CHEF_ACCEPTANCE_PENDING"));
    render(createElement(CustomerOrderStatus, { orderId: fixture.id }));
    expect(await screen.findByRole("heading", { name: "Order placed" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Order details" })).toBeTruthy();
    expect(screen.getByText(/is reviewing your order/)).toBeTruthy();
    // Before pickup the map is a blurred backdrop under the three kitchen steps.
    expect(screen.getByTestId("order-map").dataset.label).toBe("Map, hidden until your order is picked up");
    const progress = screen.getByRole("list", { name: "Order progress" });
    expect(within(progress).getAllByRole("listitem")).toHaveLength(3);
    expect(progress.querySelector('[aria-current="step"]')?.textContent).toBe("Awaiting chef");
    expect(screen.getByText("Live map opens once your order is picked up")).toBeTruthy();
    expect(screen.getByText("₹1,125.30")).toBeTruthy();
    expect(screen.getByText("₹51.30")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Track order" }).getAttribute("href")).toBe(`/orders/${fixture.id}/tracking`);
    expect(screen.getByRole("link", { name: /Get help/ }).getAttribute("href")).toBe(`/support?orderId=${fixture.id}`);
    expect(screen.getByRole("link", { name: "Your orders" }).getAttribute("href")).toBe("/orders");
  });

  it("shows the chef's cooking time and note once accepted", async () => {
    serve(order("PREPARING", { prepTimeMinutes: 25, chefResponseNote: "Preparing fresh" }));
    render(createElement(CustomerOrderStatus, { orderId: fixture.id }));
    expect(await screen.findByText(/Ready in about 25 min/)).toBeTruthy();
    expect(screen.getByText("“Preparing fresh”").closest("figure")?.textContent).toContain("Note from the chef");
  });

  it("marks the kitchen step that is actually in progress", async () => {
    for (const [status, current, done] of [
      ["PAYMENT_PENDING", undefined, 0],
      ["CHEF_ACCEPTED", "Chef accepted", 1],
      ["PREPARING", "Chef accepted", 1],
      ["READY_FOR_PICKUP", "Ready for pickup", 2],
    ] as const) {
      serve(order(status));
      render(createElement(CustomerOrderStatus, { orderId: fixture.id }));
      const progress = await screen.findByRole("list", { name: "Order progress" });
      expect(progress.querySelector('[aria-current="step"]')?.textContent, status).toBe(current);
      expect(within(progress).queryAllByText("(done)"), status).toHaveLength(done);
      cleanup();
    }
  });

  it("offers the next useful step when the order is over", async () => {
    serve(order("DELIVERED"));
    render(createElement(CustomerOrderStatus, { orderId: fixture.id }));
    expect((await screen.findByRole("link", { name: "Order again" })).getAttribute("href")).toBe(`/kitchen/${fixture.kitchen}`);
    expect(screen.queryByRole("link", { name: "Track order" })).toBeNull();
    // Only a delivered order can be rated.
    expect(screen.getByRole("heading", { name: "How was your order?" })).toBeTruthy();
    cleanup();
    serve(order("CHEF_REJECTED"));
    render(createElement(CustomerOrderStatus, { orderId: fixture.id }));
    expect(await screen.findByRole("heading", { name: /couldn’t take this order/ })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "How was your order?" })).toBeNull();
    expect(screen.getByRole("link", { name: "Browse dishes" }).getAttribute("href")).toBe("/home");
  });

  it("says an unpaid order from a while ago never reached the kitchen, offers help and stops checking", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const fetch = serve(order("PAYMENT_PENDING", { createdAt: new Date(Date.now() - 45 * 60_000).toISOString() }));
      render(createElement(CustomerOrderStatus, { orderId: fixture.id }));
      expect(await screen.findByRole("heading", { name: "Payment not completed" })).toBeTruthy();
      expect(
        screen.getByText(
          "This order wasn’t paid, so it wasn’t sent to the kitchen. If money left your account, contact support with this order number.",
        ),
      ).toBeTruthy();
      expect(screen.getByRole("link", { name: /Get help/ }).getAttribute("href")).toBe(`/support?orderId=${fixture.id}`);
      expect(screen.getByText("Order total")).toBeTruthy();
      expect(screen.queryByText(/Razorpay is confirming/)).toBeNull();
      await vi.advanceTimersByTimeAsync(45_000);
      expect(orderCalls(fetch)).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("asks for the payment within the first half hour and offers checkout's payment step", async () => {
    serve(order("PAYMENT_PENDING", { createdAt: new Date(Date.now() - 5 * 60_000).toISOString() }));
    const paymentStep = vi.fn<(props: { order: unknown; onSettled: () => void }) => ReactNode>(() =>
      createElement("button", { type: "button" }, "Pay ₹1,125"),
    );
    render(createElement(CustomerOrderStatus, { orderId: fixture.id, paymentStep }));
    expect(await screen.findByRole("heading", { name: "Payment pending" })).toBeTruthy();
    expect(screen.getByText("Finish the payment to send this order to the chef.")).toBeTruthy();
    expect(screen.getByText("To pay")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pay ₹1,125" })).toBeTruthy();
    expect(paymentStep.mock.lastCall?.[0]).toEqual({
      order: expect.objectContaining({ id: fixture.id, checkoutId: fixture.id }),
      onSettled: expect.any(Function),
    });
  });

  it("offers no payment step once the order is paid", async () => {
    serve(order("PAID"));
    const paymentStep = vi.fn(() => createElement("button", { type: "button" }, "Pay"));
    render(createElement(CustomerOrderStatus, { orderId: fixture.id, paymentStep }));
    await screen.findByRole("heading", { name: "Order placed" });
    expect(paymentStep).not.toHaveBeenCalled();
  });

  it("stops checking once an order can't change, and keeps checking while it moves", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      for (const [status, heading, calls] of [
        ["DELIVERED", "Delivered", 1],
        ["REFUNDED", "Refunded", 1],
        ["PREPARING", /is cooking/, 2],
        // A rejected order still moves on to its refund.
        ["CHEF_REJECTED", /couldn’t take this order/, 2],
      ] as const) {
        const fetch = serve(order(status));
        render(createElement(CustomerOrderStatus, { orderId: fixture.id }));
        await screen.findByRole("heading", { name: heading });
        await vi.advanceTimersByTimeAsync(30_000);
        expect(orderCalls(fetch), status).toBe(calls);
        cleanup();
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("explains a failed load and keeps a way out", async () => {
    serve({ message: "Order service is busy." }, 503);
    render(createElement(CustomerOrderStatus, { orderId: fixture.id }));
    expect(await screen.findByRole("heading", { name: "This order didn’t load" })).toBeTruthy();
    expect(screen.getByText("Order service is busy.")).toBeTruthy();
    expect(screen.getByText(/Your order and payment are safe/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});

describe("order map, chef and bill", () => {
  const delivery = (status: string, extra: Record<string, unknown> = {}) => ({
    orderId: fixture.id, deliveryJobId: null, providerId: null, status, trackingUrl: null,
    observedAt: "2026-10-10T08:40:00Z", history: [], ...extra,
  });

  it("goes live once the partner has the food, even before the order status moves", async () => {
    const fetch = serve(order("READY_FOR_PICKUP"), 200, { "/delivery-status": delivery("PICKED_UP") });
    render(createElement(CustomerOrderStatus, { orderId: fixture.id }));
    expect(await screen.findByRole("heading", { name: "On the way" })).toBeTruthy();
    const map = screen.getByRole("link", { name: "Track live: open the delivery map" });
    expect(map.getAttribute("href")).toBe(`/orders/${fixture.id}/tracking`);
    expect(within(map).getByTestId("order-map").dataset.label).toBe("Delivery map");
    expect(screen.queryByRole("list", { name: "Order progress" })).toBeNull();
    expect(fetch).toHaveBeenCalledWith(`/api/orders/${fixture.id}/delivery-status`, expect.anything());
  });

  it("keeps the kitchen steps while the partner is still on the way to the kitchen", async () => {
    serve(order("READY_FOR_PICKUP"), 200, { "/delivery-status": delivery("COURIER_TO_PICKUP") });
    render(createElement(CustomerOrderStatus, { orderId: fixture.id }));
    expect(await screen.findByRole("heading", { name: "Packed and ready" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Order progress" })).toBeTruthy();
  });

  it("asks nothing about delivery before the food is ready, and shows no map once the order is closed", async () => {
    const fetch = serve(order("PREPARING"));
    render(createElement(CustomerOrderStatus, { orderId: fixture.id }));
    await screen.findByRole("heading", { name: /is cooking/ });
    expect(fetch.mock.calls.some(([url]) => url.endsWith("/delivery-status"))).toBe(false);
    cleanup();
    serve(order("CANCELLED"));
    render(createElement(CustomerOrderStatus, { orderId: fixture.id }));
    await screen.findByRole("heading", { name: "Order cancelled" });
    expect(screen.queryByTestId("order-map")).toBeNull();
  });

  it("opens the delivery history from a delivered order's map", async () => {
    serve(order("DELIVERED"));
    render(createElement(CustomerOrderStatus, { orderId: fixture.id }));
    expect((await screen.findByRole("link", { name: "Delivery history" })).getAttribute("href")).toBe(`/orders/${fixture.id}/tracking`);
  });

  it("shows the chef's face and the dish photos the kitchen's menu still has", async () => {
    const menuItem = (id: string, primaryImageUrl: string | null) => ({
      id, kitchenId: fixture.kitchen, kitchenName: "Ammi's Dastarkhwan", itemName: "Dish", category: "Biryani",
      foodType: "NON_VEG", price: 329, currency: "INR", imageUrls: [], primaryImageUrl,
    });
    // Its own kitchen: profiles are cached for the page load, and earlier tests found none.
    const kitchenId = "0bde0000-0000-4000-8000-000000000021";
    serve(
      order("DELIVERED", {
        kitchenId,
        items: [
          { ...order("DELIVERED").items[0] },
          { ...order("DELIVERED").items[0], id: "0bde0000-0000-4000-8000-000000000032", menuItemId: "0bde0000-0000-4000-8000-000000000042", itemName: "Double ka meetha" },
        ],
      }),
      200,
      {
        [`/api/catalog/kitchens/${kitchenId}`]: {
          id: kitchenId, kitchenName: "Ammi's Dastarkhwan", displayName: "Ammi", status: "ACTIVE",
          chefPhotoUrl: "https://cdn.craves.in/chefs/ammi.png", kitchenPhotoUrls: [],
        },
        "/menu-items": [
          menuItem("0bde0000-0000-4000-8000-000000000041", "https://cdn.craves.in/dishes/biryani.jpg"),
          menuItem("0bde0000-0000-4000-8000-000000000042", "http://cdn.craves.in/dishes/meetha.jpg"),
        ],
      },
    );
    const { container } = render(createElement(CustomerOrderStatus, { orderId: fixture.id }));
    await screen.findByRole("heading", { name: "Delivered" });
    await waitFor(() => expect(container.querySelector('img[src="https://cdn.craves.in/dishes/biryani.jpg"]')).toBeTruthy());
    expect(container.querySelector('img[src="https://cdn.craves.in/chefs/ammi.png"]')).toBeTruthy();
    // Only https photos from the server are drawn.
    expect(container.querySelector('img[src^="http:"]')).toBeNull();
  });
});

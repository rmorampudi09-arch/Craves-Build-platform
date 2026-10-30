// @vitest-environment jsdom
// The page checkout lands on after payment. Synthetic owned orders; no network or customer mutations.
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { CustomerOrderStatus } from "../components/CustomerOrderStatus";
import { markPaidParcelDue } from "@/shared/lib/paid-parcel";

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
    expect(await screen.findByRole("heading", { name: "Waiting for the chef" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Order details" })).toBeTruthy();
    expect(screen.getByText("The chef will confirm your order shortly.")).toBeTruthy();
    // A paid order is the Kitchen Calendar's day sheet: each step by its time, now marked, the rest still to come.
    const steps = screen.getByRole("list", { name: "Order steps" });
    expect(within(steps).getAllByRole("listitem")).toHaveLength(6);
    expect(steps.querySelector('[aria-current="step"]')?.textContent).toContain("Waiting for Ammi");
    // The sheet lists the kitchen steps, so there is no blurred map under them.
    expect(screen.queryByTestId("order-map")).toBeNull();
    expect(screen.getByText("₹1,125.30")).toBeTruthy();
    expect(screen.getByText("₹51.30")).toBeTruthy();
    // Each dish reads like the app: the name, then "2 × ₹329 · Biryani".
    expect(screen.getByText("Hyderabadi Chicken Dum Biryani")).toBeTruthy();
    expect(screen.getByText("2 × ₹329 · Biryani")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Payment" }).nextElementSibling?.textContent).toBe("Paid");
    expect(screen.getByRole("link", { name: "Track order" }).getAttribute("href")).toBe(`/orders/${fixture.id}/tracking`);
    expect(screen.getByRole("link", { name: /Get help/ }).getAttribute("href")).toBe(`/support?orderId=${fixture.id}`);
    expect(screen.getByRole("link", { name: "Your orders" }).getAttribute("href")).toBe("/orders");
  });

  it("shows the chef's cooking time and note once accepted", async () => {
    serve(order("PREPARING", { prepTimeMinutes: 25, chefResponseNote: "Preparing fresh" }));
    render(createElement(CustomerOrderStatus, { orderId: fixture.id }));
    const steps = await screen.findByRole("list", { name: "Order steps" });
    expect(steps.querySelector('[aria-current="step"]')?.textContent).toContain("Cooking now");
    expect(within(steps).getByText("Ready in about 25 min")).toBeTruthy();
    expect(screen.getByText("“Preparing fresh”").closest("figure")?.textContent).toContain("Note from the chef");
  });

  it("marks the step that is actually in progress", async () => {
    // Recent, so an unpaid order is still waiting for its payment: the kitchen steps wait with it.
    serve(order("PAYMENT_PENDING", { createdAt: new Date().toISOString() }));
    render(createElement(CustomerOrderStatus, { orderId: fixture.id }));
    const progress = await screen.findByRole("list", { name: "Order progress" });
    expect(progress.querySelector('[aria-current="step"]')).toBeNull();
    expect(within(progress).queryAllByText("(done)")).toHaveLength(0);
    cleanup();
    for (const [status, current] of [
      ["CHEF_ACCEPTED", "Ammi accepted"],
      ["PREPARING", "Cooking now"],
      ["READY_FOR_PICKUP", "Packed"],
    ] as const) {
      serve(order(status));
      render(createElement(CustomerOrderStatus, { orderId: fixture.id }));
      const steps = await screen.findByRole("list", { name: "Order steps" });
      expect(steps.querySelector('[aria-current="step"]')?.textContent, status).toContain(current);
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
    expect(await screen.findByRole("heading", { name: "Chef declined" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "How was your order?" })).toBeNull();
    // Whether money moves back shows as the refund's own status; nothing to claim yet.
    expect(screen.queryByRole("heading", { name: "Payment" })).toBeNull();
    expect(screen.getByRole("link", { name: "Browse dishes" }).getAttribute("href")).toBe("/home");
  });

  it("says an unpaid order from a while ago never reached the kitchen, offers help and stops checking", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const fetch = serve(order("PAYMENT_PENDING", { createdAt: new Date(Date.now() - 45 * 60_000).toISOString() }));
      const paymentStep = vi.fn(() => createElement("button", { type: "button" }, "Pay"));
      render(createElement(CustomerOrderStatus, { orderId: fixture.id, paymentStep }));
      expect(await screen.findByRole("heading", { name: "Payment not completed" })).toBeTruthy();
      expect(
        screen.getByText(
          "This order wasn’t paid, so it wasn’t sent to the kitchen. If money left your account, contact support with this order number.",
        ),
      ).toBeTruthy();
      expect(screen.getByRole("link", { name: /Get help/ }).getAttribute("href")).toBe(`/support?orderId=${fixture.id}`);
      expect(screen.getByText("Order total")).toBeTruthy();
      expect(screen.getByRole("heading", { name: "Payment" }).nextElementSibling?.textContent).toBe("Payment not completed");
      expect(screen.queryByText(/Razorpay is confirming/)).toBeNull();
      // It says one thing: no kitchen steps waiting for the chef, and no Pay.
      expect(screen.queryByTestId("order-map")).toBeNull();
      expect(paymentStep).not.toHaveBeenCalled();
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
    await screen.findByRole("heading", { name: "Waiting for the chef" });
    expect(paymentStep).not.toHaveBeenCalled();
  });

  it("right after checkout verified the payment, says it is being confirmed instead of asking to pay again", async () => {
    serve(order("PAYMENT_PENDING", { createdAt: new Date(Date.now() - 2 * 60_000).toISOString() }));
    const paymentStep = vi.fn(() => createElement("button", { type: "button" }, "Pay"));
    render(createElement(CustomerOrderStatus, { orderId: fixture.id, justPaid: true, paymentStep }));
    expect(await screen.findByRole("heading", { name: "Confirming your payment" })).toBeTruthy();
    expect(screen.getByText(/there’s no need to pay again/)).toBeTruthy();
    expect(screen.getByText("Total paid")).toBeTruthy();
    expect(paymentStep).not.toHaveBeenCalled();
  });

  it("folds the leaf into a parcel once, only after this tab's checkout verified the payment", async () => {
    sessionStorage.clear();
    // A typed, bookmarked or shared ?paid=1 link without a verified payment opens the page as usual.
    serve(order("CHEF_ACCEPTANCE_PENDING"));
    render(createElement(CustomerOrderStatus, { orderId: fixture.id, justPaid: true }));
    await screen.findByRole("heading", { name: "Waiting for the chef" });
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(screen.queryByText("Paid ₹1,125.30")).toBeNull();
    cleanup();
    // Checkout marks the order once Razorpay's success is verified as PAID.
    markPaidParcelDue(fixture.id);
    serve(order("CHEF_ACCEPTANCE_PENDING"));
    render(createElement(CustomerOrderStatus, { orderId: fixture.id, justPaid: true }));
    await screen.findByRole("heading", { name: "Waiting for the chef" });
    // Decorative and hidden from screen readers: the page under it says the same.
    // No dish photos here (the menu read fails), so it starts after its 0.7 s wait for them.
    const paid = await screen.findByText("Paid ₹1,125.30");
    expect(paid.closest('[aria-hidden="true"]')).toBeTruthy();
    expect(screen.getByText("Sent to Ammi's Dastarkhwan")).toBeTruthy();
    cleanup();
    // A reload, or Back to this page, shows the page at once.
    serve(order("CHEF_ACCEPTANCE_PENDING"));
    render(createElement(CustomerOrderStatus, { orderId: fixture.id, justPaid: true }));
    await screen.findByRole("heading", { name: "Waiting for the chef" });
    expect(screen.queryByText("Paid ₹1,125.30")).toBeNull();
    cleanup();
    // Opened later from Your orders, it doesn't play either.
    serve(order("CHEF_ACCEPTANCE_PENDING"));
    render(createElement(CustomerOrderStatus, { orderId: fixture.id }));
    await screen.findByRole("heading", { name: "Waiting for the chef" });
    expect(screen.queryByText("Paid ₹1,125.30")).toBeNull();
  });

  it("stops checking once an order can't change, and keeps checking while it moves", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      for (const [status, heading, calls] of [
        ["DELIVERED", "Delivered", 1],
        ["REFUNDED", "Refunded", 1],
        ["PREPARING", "Preparing your food", 2],
        // A rejected order still moves on to its refund.
        ["CHEF_REJECTED", "Chef declined", 2],
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

  it("stays at Packed while the partner is still on the way to the kitchen", async () => {
    serve(order("READY_FOR_PICKUP"), 200, { "/delivery-status": delivery("COURIER_TO_PICKUP") });
    render(createElement(CustomerOrderStatus, { orderId: fixture.id }));
    expect(await screen.findByRole("heading", { name: "Ready for pickup" })).toBeTruthy();
    const steps = screen.getByRole("list", { name: "Order steps" });
    expect(steps.querySelector('[aria-current="step"]')?.textContent).toContain("Packed");
  });

  it("asks nothing about delivery before the food is ready, and shows no map once the order is closed", async () => {
    const fetch = serve(order("PREPARING"));
    render(createElement(CustomerOrderStatus, { orderId: fixture.id }));
    await screen.findByRole("heading", { name: "Preparing your food" });
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

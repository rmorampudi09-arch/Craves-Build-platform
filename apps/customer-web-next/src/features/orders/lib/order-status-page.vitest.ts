// @vitest-environment jsdom
// The page checkout lands on after payment. Synthetic owned orders; no network or customer mutations.
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
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

function serve(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("order status after payment", () => {
  it("confirms the order, says what happens next and keeps the paise in the bill", async () => {
    serve(order("CHEF_ACCEPTANCE_PENDING"));
    render(createElement(CustomerOrderStatus, { orderId: fixture.id }));
    expect(await screen.findByRole("heading", { name: "Order placed" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Order status" })).toBeTruthy();
    expect(screen.getByText(/is reviewing your order/)).toBeTruthy();
    const progress = screen.getByText("Payment received").closest("ol")!;
    expect(within(progress).getAllByRole("listitem")).toHaveLength(5);
    const current = progress.querySelector('[aria-current="step"]');
    expect(current?.textContent).toContain("Waiting for Ammi's Dastarkhwan to accept");
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
    expect(screen.getByText("“Preparing fresh”")).toBeTruthy();
  });

  it("marks the step that is actually in progress", async () => {
    for (const [status, current] of [
      ["PREPARING", "Cooking your order"],
      ["READY_FOR_PICKUP", "Waiting for pickup"],
      ["OUT_FOR_DELIVERY", "On the way to you"],
    ] as const) {
      serve(order(status));
      render(createElement(CustomerOrderStatus, { orderId: fixture.id }));
      const step = (await screen.findByText(current)).closest("li")!;
      expect(step.getAttribute("aria-current")).toBe("step");
      cleanup();
    }
  });

  it("offers the next useful step when the order is over", async () => {
    serve(order("DELIVERED"));
    render(createElement(CustomerOrderStatus, { orderId: fixture.id }));
    expect((await screen.findByRole("link", { name: "Order again" })).getAttribute("href")).toBe(`/kitchen/${fixture.kitchen}`);
    expect(screen.queryByRole("link", { name: "Track order" })).toBeNull();
    cleanup();
    serve(order("CHEF_REJECTED"));
    render(createElement(CustomerOrderStatus, { orderId: fixture.id }));
    expect(await screen.findByRole("heading", { name: /couldn’t take this order/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Browse dishes" }).getAttribute("href")).toBe("/home");
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

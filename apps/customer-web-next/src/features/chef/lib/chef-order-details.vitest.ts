// @vitest-environment jsdom
// Synthetic orders for a fixture kitchen; no backend is contacted.
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChefOrderDetails } from "../components/chef-order-details";
import type { ChefOrder } from "./chef-order-contract";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/chef/orders"),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const ID = "0bde0101-0000-4000-8000-000000000101";

function order(status: ChefOrder["status"]): ChefOrder {
  return {
    id: ID, kitchenName: "Fixture Kitchen", status, currency: "INR", foodSubtotal: 298, platformFee: 9, taxAmount: 15, deliveryFee: 39, grandTotal: 361,
    chefResponseNote: null, prepTimeMinutes: null,
    deliveryAddress: { recipientName: "Fixture Customer", contactPhoneNumber: "+91 90000 00001", addressLine1: "1 Fixture Road", addressLine2: null, landmark: null, areaName: null, city: "Hyderabad", state: "Telangana", postalCode: "500001" },
    items: [{ id: "0bde1011-0000-4000-8000-000000001011", menuItemId: "d15b0000-0000-4000-8000-000000000004", itemName: "Rasmalai (4 pcs)", category: null, foodType: "VEG", unitPrice: 149, quantity: 2, lineTotal: 298 }],
    createdAt: "2026-10-10T08:00:00Z", updatedAt: "2026-10-10T08:00:00Z",
  };
}

function open(value: ChefOrder) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => (String(input) === `/api/chef/orders/${ID}` ? Response.json(value) : Response.json({}, { status: 404 }))));
  render(createElement(ChefOrderDetails, { orderId: ID }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("order details", () => {
  it("says an unpaid order has nothing to cook and keeps the customer's contact details private", async () => {
    open(order("PAYMENT_PENDING"));
    expect(await screen.findByText("The customer hasn’t paid yet. Nothing to cook now. If they pay, it rings as a new order.")).toBeTruthy();
    expect(screen.getByText("Rasmalai (4 pcs)")).toBeTruthy();
    expect(screen.queryByText("Fixture Customer")).toBeNull();
    expect(screen.queryByText(/1 Fixture Road/)).toBeNull();
    expect(screen.queryByRole("link", { name: /Call|Message customer/ })).toBeNull();
  });

  it.each(["CANCELLED", "DELIVERED"] as const)("keeps the contact details private on a %s order (it may never have been paid)", async (status) => {
    open(order(status));
    expect(await screen.findByText("Rasmalai (4 pcs)")).toBeTruthy();
    expect(screen.queryByText("Fixture Customer")).toBeNull();
    expect(screen.queryByText(/1 Fixture Road/)).toBeNull();
    expect(screen.queryByRole("link", { name: /Call|Message customer/ })).toBeNull();
  });

  it("shows the customer's contact details once the order is paid", async () => {
    open(order("CHEF_ACCEPTANCE_PENDING"));
    expect(await screen.findByText("Fixture Customer")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Message customer" }).getAttribute("href")).toBe("sms:+919000000001");
    expect(screen.queryByText(/hasn’t paid yet/)).toBeNull();
  });
});

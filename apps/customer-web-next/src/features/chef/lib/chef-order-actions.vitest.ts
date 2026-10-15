// @vitest-environment jsdom
// Synthetic orders for a fixture kitchen; no backend is contacted.
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChefOrderActions } from "../components/chef-order-actions";
import type { ChefOrder } from "./chef-order-contract";

const ID = "0bde0101-0000-4000-8000-000000000101";
const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

function order(patch: Partial<ChefOrder> = {}): ChefOrder {
  return {
    id: ID, kitchenName: "Fixture Kitchen", status: "CHEF_ACCEPTANCE_PENDING", currency: "INR", foodSubtotal: 298, platformFee: 9, taxAmount: 15,
    deliveryFee: 39, grandTotal: 361, chefResponseNote: null, prepTimeMinutes: null, deliveryAddress: null,
    items: [{ id: "0bde1011-0000-4000-8000-000000001011", menuItemId: "d15b0000-0000-4000-8000-000000000004", itemName: "Rasmalai (4 pcs)", category: null, foodType: "VEG", unitPrice: 149, quantity: 2, lineTotal: 298 }],
    createdAt: "2026-10-10T08:00:00Z", updatedAt: "2026-10-10T08:00:00Z", checkoutId: null, chefAcceptanceExpiresAt: null,
    ...patch,
  };
}
const show = (value: ChefOrder, onUpdated = vi.fn()) => render(createElement(ChefOrderActions, { order: value, onUpdated, inline: true }));

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => Response.json({}, { status: 404 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("new order", () => {
  it("counts down to the server's deadline and says when it has passed", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-10-10T08:10:58Z"));
    show(order({ chefAcceptanceExpiresAt: "2026-10-10T08:15:00Z" }));
    expect(screen.getByRole("timer").textContent).toBe("Respond in 4:02");
    act(() => { vi.advanceTimersByTime(242_000); });
    expect(screen.getByRole("timer").textContent).toBe("Time to respond has passed");
  });

  it("shows no countdown without a deadline", () => {
    show(order());
    expect(screen.queryByRole("timer")).toBeNull();
  });

  it("tells the chef what declining means for a meal-plan day and for a paid order", () => {
    show(order());
    fireEvent.click(screen.getByRole("button", { name: /Can’t take it/ }));
    expect(screen.getByText("The customer is told right away. This meal-plan day moves to the end of their plan.")).toBeTruthy();
    cleanup();
    show(order({ checkoutId: "21111111-2222-4333-8444-555555555555" }));
    fireEvent.click(screen.getByRole("button", { name: /Can’t take it/ }));
    expect(screen.getByText("The customer is told right away and gets a full refund.")).toBeTruthy();
  });
});

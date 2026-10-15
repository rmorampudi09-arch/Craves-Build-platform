// @vitest-environment jsdom
// Synthetic orders for a fixture kitchen; no backend is contacted.
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChefOrderActions } from "../components/chef-order-actions";
import type { ChefOrder } from "./chef-order-contract";

const ID = "0bde0101-0000-4000-8000-000000000101";
const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

function order(patch: Partial<ChefOrder> = {}): ChefOrder {
  return {
    id: ID,
    kitchenName: "Fixture Kitchen",
    status: "CHEF_ACCEPTANCE_PENDING",
    currency: "INR",
    foodSubtotal: 298,
    platformFee: 9,
    taxAmount: 15,
    deliveryFee: 39,
    grandTotal: 361,
    chefResponseNote: null,
    prepTimeMinutes: null,
    deliveryAddress: null,
    items: [
      {
        id: "0bde1011-0000-4000-8000-000000001011",
        menuItemId: "d15b0000-0000-4000-8000-000000000004",
        itemName: "Rasmalai (4 pcs)",
        category: null,
        foodType: "VEG",
        unitPrice: 149,
        quantity: 2,
        lineTotal: 298,
      },
    ],
    createdAt: "2026-10-10T08:00:00Z",
    updatedAt: "2026-10-10T08:00:00Z",
    checkoutId: null,
    chefAcceptanceExpiresAt: null,
    ...patch,
  };
}
const show = (value: ChefOrder, onUpdated = vi.fn()) =>
  render(createElement(ChefOrderActions, { order: value, onUpdated, inline: true }));

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
    act(() => {
      vi.advanceTimersByTime(242_000);
    });
    expect(screen.getByRole("timer").textContent).toBe("Time to respond has passed");
  });

  it("shows no countdown without a deadline", () => {
    show(order());
    expect(screen.queryByRole("timer")).toBeNull();
  });

  it("accepts in one tap with the slowest dish's cooking time", async () => {
    const dish = { id: "d15b0000-0000-4000-8000-000000000004", itemName: "Rasmalai (4 pcs)", category: "Desserts", foodType: "VEG", price: 149, currency: "INR", status: "ACTIVE", preparationTimeMinutes: 35, unitPackageWeightGrams: 300, images: [], createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" };
    const onUpdated = vi.fn();
    fetchMock.mockImplementation(async (input) => String(input) === "/api/chef/menu"
      ? Response.json([dish])
      : Response.json(order({ status: "CHEF_ACCEPTED", prepTimeMinutes: 35 })));
    show(order(), onUpdated);
    fireEvent.click(await screen.findByRole("button", { name: "Accept · ready in 35 min" }));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ status: "CHEF_ACCEPTED" })));
    const [path, init] = fetchMock.mock.calls[1];
    expect(path).toBe(`/api/chef/orders/${ID}/accept`);
    expect(JSON.parse(String(init?.body))).toMatchObject({ prepTimeMinutes: 35, note: null });
  });

  it("falls back to 15 minutes when the menu can't be read, and keeps the picker one tap away", async () => {
    show(order());
    expect(await screen.findByRole("button", { name: "Accept · ready in 15 min" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Choose another time" }));
    expect(screen.getByRole("heading", { name: "How long will it take?" })).toBeTruthy();
  });

  it("tells the chef what declining means for a meal-plan day and for a paid order", () => {
    show(order());
    fireEvent.click(screen.getByRole("button", { name: /Can’t take it/ }));
    expect(
      screen.getByText(
        "The customer is told right away. This meal-plan day moves to the end of their plan.",
      ),
    ).toBeTruthy();
    cleanup();
    show(order({ checkoutId: "21111111-2222-4333-8444-555555555555" }));
    fireEvent.click(screen.getByRole("button", { name: /Can’t take it/ }));
    expect(
      screen.getByText("The customer is told right away and gets a full refund."),
    ).toBeTruthy();
  });
});

describe("ready order", () => {
  const ready = (patch: Partial<ChefOrder> = {}) => order({ status: "READY_FOR_PICKUP", ...patch });
  const partner = { name: "Ravi Kumar", phone: "+91 98888 88888", photoUrl: null, pickupEtaAt: "2026-10-10T08:20:00Z" };
  const supportCase = {
    id: "5a0c0000-0000-4000-8000-0000000000c1", caseNumber: "CRV-5A0C0", requesterRole: "CHEF", orderId: ID, subject: "Not picked up · #0BDE0101", status: "OPEN",
    lastRequesterMessageAt: null, lastSupportMessageAt: null, resolvedAt: null, closedAt: null, createdAt: "2026-10-10T08:30:00Z", updatedAt: "2026-10-10T08:30:00Z", messages: [],
  };

  it("shows the delivery partner with a call link and the pickup time", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T08:14:30Z"));
    show(ready({ deliveryPartner: partner }));
    expect(screen.getByText("Ravi Kumar · Craves delivery")).toBeTruthy();
    expect(screen.getByText("Arriving in 6 min")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Call Ravi Kumar" }).getAttribute("href")).toBe("tel:+919888888888");
    // No photo: a delivery bike, never the chef avatar.
    expect(document.querySelector(".lucide-bike")).toBeTruthy();
    cleanup();
    show(ready({ deliveryPartner: { ...partner, photoUrl: "https://cdn.craves.in/partners/ravi.jpg" } }));
    expect(document.querySelector("img")?.getAttribute("src")).toBe("https://cdn.craves.in/partners/ravi.jpg");
    expect(document.querySelector(".lucide-bike")).toBeNull();
  });

  it("says when no partner is assigned, and hides Handed over when the server has no hand-over", () => {
    show(ready());
    expect(screen.getByText("Waiting for a delivery partner")).toBeTruthy();
    expect(document.querySelector(".lucide-bike")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Handed over" })).toBeNull();
  });

  it("marks the order handed over", async () => {
    const onUpdated = vi.fn();
    fetchMock.mockResolvedValueOnce(Response.json(ready({ chefHandedOverAt: "2026-10-10T08:31:00Z" })));
    show(ready({ chefHandedOverAt: null }), onUpdated);
    fireEvent.click(screen.getByRole("button", { name: "Handed over" }));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ chefHandedOverAt: "2026-10-10T08:31:00Z" })));
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/chef/orders/${ID}/handed-over`);
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
  });

  it("says Handed over is coming soon while the server has no route", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ code: "FEATURE_NOT_AVAILABLE" }, { status: 404 }));
    show(ready({ chefHandedOverAt: null }));
    fireEvent.click(screen.getByRole("button", { name: "Handed over" }));
    expect(await screen.findByText("Handed over is coming soon.", { selector: "p:not(.sr-only)" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Handed over" })).toBeNull();
  });

  it("opens a support ticket for an order nobody picked up", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(supportCase, { status: 201 }));
    show(ready());
    fireEvent.click(screen.getByRole("button", { name: "Not picked up" }));
    expect(await screen.findByRole("dialog", { name: "What happened with #0BDE0101?" })).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Partner left without the order"));
    fireEvent.change(screen.getByLabelText("Details for support"), { target: { value: "Waited 20 min" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to support" }));
    expect(await screen.findByText("Sent to Craves support")).toBeTruthy();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/support/cases");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      contextRole: "CHEF", orderId: ID, subject: "Not picked up · #0BDE0101", message: "Partner left without the order\n\nWaited 20 min",
    });
  });

  it("keeps the sheet open on a failure and closes it with a note when support is not live", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ code: "SUPPORT_CASE_FAILED" }, { status: 503 }));
    show(ready());
    fireEvent.click(screen.getByRole("button", { name: "Not picked up" }));
    fireEvent.click(await screen.findByRole("button", { name: "Send to support" }));
    expect((await screen.findByRole("alert")).textContent).toBe("We couldn’t send this. Check your connection and try again.");
    fetchMock.mockResolvedValueOnce(Response.json({ code: "FEATURE_NOT_AVAILABLE" }, { status: 404 }));
    fireEvent.click(screen.getByRole("button", { name: "Send to support" }));
    expect(await screen.findByText("Support is coming soon. Call Craves support.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("cooking order", () => {
  const cooking = order({ status: "PREPARING", prepTimeMinutes: 20, updatedAt: "2026-10-10T08:00:00Z" });

  it("counts down to ready, then shows how late it is", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-10-10T08:12:00Z"));
    show(cooking);
    expect(screen.getByRole("timer").textContent).toBe("Ready in 8 min");
    act(() => { vi.advanceTimersByTime(10 * 60_000); });
    expect(screen.getByRole("timer").textContent).toBe("2 min late");
  });

  it("asks before marking the order ready, and only then tells the server", async () => {
    const onUpdated = vi.fn();
    fetchMock.mockResolvedValueOnce(Response.json(order({ status: "READY_FOR_PICKUP" })));
    show(cooking, onUpdated);
    fireEvent.click(screen.getByRole("button", { name: "Food is ready for pickup" }));
    const dialog = await screen.findByRole("dialog", { name: "Is #0BDE0101 packed and ready?" });
    expect(dialog.textContent).toContain("2 × Rasmalai (4 pcs). The delivery partner is told to pick it up.");
    fireEvent.click(screen.getByRole("button", { name: "Not yet" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Food is ready for pickup" }));
    fireEvent.click(await screen.findByRole("button", { name: "Yes, it’s ready" }));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ status: "READY_FOR_PICKUP" })));
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/chef/orders/${ID}/ready-for-pickup`);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

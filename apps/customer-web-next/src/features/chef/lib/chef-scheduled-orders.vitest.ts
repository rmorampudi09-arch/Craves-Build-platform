// @vitest-environment jsdom
// Scheduled orders: the BFF and the Scheduled tab, with synthetic requests; no backend is contacted.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextRequest } from "next/server";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/server-api", async (original) => ({ ...await original<typeof import("@/shared/lib/server-api")>(), authenticatedApiFetch: upstream }));
vi.mock("next/navigation", () => ({ usePathname: () => "/chef/orders", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
import { GET } from "@/app/api/chef/scheduled-orders/route";
import { PUT } from "@/app/api/chef/scheduled-orders/[scheduleRequestId]/orders/[orderId]/response/route";
import { ChefOrderInbox } from "../components/chef-order-inbox";
import { resetOrderAlertsForTests } from "./chef-order-alert";
import type { ChefOrder } from "./chef-order-contract";

const SCHEDULE = "11111111-1111-4111-8111-111111111111";
const ORDER = "0bde0109-0000-4000-8000-000000000109";
const request = { scheduleRequestId: SCHEDULE, orderId: ORDER, requestedFulfilmentAt: "2026-10-27T07:30:00Z", responseStatus: "PENDING", paymentGate: "PAYMENT_BEFORE_CHEF_CONFIRMATION", responseVersion: 3 };
const live: ChefOrder = {
  id: ORDER, kitchenName: "Fixture Kitchen", status: "PAID", currency: "INR", foodSubtotal: 450, platformFee: 9, taxAmount: 15, deliveryFee: 39, grandTotal: 513, chefResponseNote: null, prepTimeMinutes: null,
  deliveryAddress: { recipientName: "Priya Sharma", contactPhoneNumber: "+91 90000 00001", addressLine1: "1 Fixture Road", addressLine2: null, landmark: null, areaName: "Madhapur", city: "Hyderabad", state: "Telangana", postalCode: "500081" },
  items: [{ id: "0bde1011-0000-4000-8000-000000001011", menuItemId: "d15b0000-0000-4000-8000-000000000004", itemName: "Veg biryani", category: null, foodType: "VEG", unitPrice: 225, quantity: 2, lineTotal: 450 }],
  createdAt: "2026-10-26T04:00:00Z", updatedAt: "2026-10-26T04:00:00Z",
};
const put = (body: unknown, origin = "https://craves.in", id = ORDER) =>
  PUT(new NextRequest(`https://craves.in/api/chef/scheduled-orders/${SCHEDULE}/orders/${id}/response`, { method: "PUT", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ scheduleRequestId: SCHEDULE, orderId: id }) });

beforeEach(() => {
  upstream.mockReset();
  sessionStorage.clear();
  resetOrderAlertsForTests();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("scheduled orders BFF", () => {
  it("checks the query and forwards it", async () => {
    for (const query of ["?limit=0", "?limit=101", "?responseStatus=MAYBE", "?cursor=a.b"]) expect((await GET(new NextRequest(`https://craves.in/api/chef/scheduled-orders${query}`))).status, query).toBe(400);
    upstream.mockResolvedValue(Response.json({ items: [request], nextCursor: null, hasMore: false }));
    const response = await GET(new NextRequest("https://craves.in/api/chef/scheduled-orders?responseStatus=PENDING&limit=20"));
    expect([response.status, (await response.json()).items[0].responseVersion]).toEqual([200, 3]);
    expect(upstream.mock.calls[0][1]).toBe("/chef/scheduled-orders?limit=20&responseStatus=PENDING");
    upstream.mockResolvedValue(new Response(null, { status: 404 }));
    expect((await (await GET(new NextRequest("https://craves.in/api/chef/scheduled-orders"))).json()).code).toBe("FEATURE_NOT_AVAILABLE");
  });

  it("sends a checked answer from this site only and passes a conflict on", async () => {
    expect((await put({ action: "ACCEPT", expectedVersion: 3 }, "https://evil.example")).status).toBe(403);
    expect((await put({ action: "MAYBE", expectedVersion: 3 })).status).toBe(400);
    expect((await put({ action: "ACCEPT", expectedVersion: 3 }, undefined, "order")).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
    upstream.mockResolvedValue(Response.json({ orderId: ORDER, kitchenId: SCHEDULE, status: "ACCEPTED", paymentGate: "PAYMENT_BEFORE_CHEF_CONFIRMATION", responseNote: null, version: 4, respondedAt: "2026-10-26T05:00:00Z" }));
    expect(await (await put({ action: "ACCEPT", responseNote: null, expectedVersion: 3 })).json()).toEqual({ orderId: ORDER, status: "ACCEPTED" });
    expect(upstream.mock.calls[0].slice(1)).toEqual([`/chef/scheduled-orders/${SCHEDULE}/orders/${ORDER}/response`, expect.objectContaining({ method: "PUT", body: JSON.stringify({ action: "ACCEPT", responseNote: null, expectedVersion: 3 }) })]);
    upstream.mockResolvedValue(Response.json({ code: "SCHEDULE_RESPONSE_VERSION_CONFLICT" }, { status: 409 }));
    const conflict = await put({ action: "REJECT", responseNote: "Busy", expectedVersion: 3 });
    expect([conflict.status, (await conflict.json()).code]).toEqual([409, "SCHEDULE_RESPONSE_VERSION_CONFLICT"]);
  });
});

describe("Scheduled tab", () => {
  function open(scheduled: () => Response) {
    // 26 Oct 2026, 10:00 am in India; only the date is faked so promises and timers run as usual.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-26T04:30:00Z") });
    let pending = [request];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/chef/orders") return Response.json([live]);
      if (url === "/api/chef/scheduled-orders?responseStatus=PENDING&limit=20") {
        const answer = scheduled();
        return answer.ok ? Response.json({ items: pending, nextCursor: null, hasMore: false }) : answer;
      }
      if (url === "/api/chef/scheduled-orders?responseStatus=ACCEPTED&limit=50") return Response.json({ items: [], nextCursor: null, hasMore: false });
      if (url.endsWith("/response") && init?.method === "PUT") {
        pending = [];
        return Response.json({ orderId: ORDER, kitchenId: SCHEDULE, status: "ACCEPTED", version: 4 });
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetcher);
    render(createElement(ChefOrderInbox));
    return fetcher;
  }

  it("counts the requests waiting, shows when, who and what, and confirms after asking", async () => {
    const fetcher = open(() => new Response("{}"));
    const tab = await screen.findByRole("button", { name: /^Scheduled\s*1$/ }, { timeout: 5_000 });
    fireEvent.click(tab);
    const card = await screen.findByRole("article", { name: "Tomorrow, 1:00 pm" });
    expect(within(card).getByText("#0BDE0109 · Priya S. · Madhapur")).toBeTruthy();
    expect(within(card).getByText("Veg biryani")).toBeTruthy();
    expect(within(card).getByText("Customer has already paid.")).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Confirm scheduled order #0BDE0109" }));
    const dialog = await screen.findByRole("dialog", { name: "Confirm for tomorrow, 1:00 pm?" });
    expect(within(dialog).getByText("It shows up in New orders when it is time to cook.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("Confirmed. It shows up in New orders when it is time to cook.")).toBeTruthy();
    const answer = fetcher.mock.calls.find(([, init]) => init?.method === "PUT")!;
    expect([answer[0], JSON.parse(String(answer[1]!.body))]).toEqual([`/api/chef/scheduled-orders/${SCHEDULE}/orders/${ORDER}/response`, { action: "ACCEPT", responseNote: null, expectedVersion: 3 }]);
    await waitFor(() => expect(screen.getByRole("heading", { name: "No scheduled orders" })).toBeTruthy());
  });

  it("says Coming soon while the route isn't live", async () => {
    open(() => Response.json({ code: "FEATURE_NOT_AVAILABLE" }, { status: 404 }));
    fireEvent.click(await screen.findByRole("button", { name: /^Scheduled$/ }, { timeout: 5_000 }));
    expect(await screen.findByRole("heading", { name: "Scheduled orders are coming soon" })).toBeTruthy();
  });
});

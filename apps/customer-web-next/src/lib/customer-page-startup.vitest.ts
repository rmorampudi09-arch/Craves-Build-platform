// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CartPage from "../screens/Cart/Cart";
import OrdersPage from "../screens/OrderHistory/OrderHistory";
import { setSessionIdentity } from "../services/auth/cravesAuth";
import type { CravesIdentity } from "./auth-contract";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate, Link: ({ children }: { children: unknown }) => children }));
const owner: CravesIdentity = { id: "11111111-1111-4111-8111-111111111111", phoneNumber: "+10000000000", displayName: "Fixture customer", email: null, emailVerified: false, status: "ACTIVE", roles: ["CUSTOMER"] };
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function emptyCart() { return { id: "22222222-2222-4222-8222-222222222222", currency: "INR", foodSubtotal: 0, items: [] }; }
function order(kitchenName: string) {
  return { id: "33333333-3333-4333-8333-333333333333", checkoutId: "44444444-4444-4444-8444-444444444444", kitchenId: "55555555-5555-4555-8555-555555555555", kitchenName, status: "PAID", currency: "INR", foodSubtotal: 100, platformFee: 0, taxAmount: 0, deliveryFee: 0, grandTotal: 100, items: [], createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z" };
}
beforeEach(() => {
  setSessionIdentity(owner);
  navigate.mockReset();
  window.sessionStorage.clear();
  fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("customer page startup", () => {
  it.each([
    ["cart", CartPage, "Cart unavailable", "Try again", "/api/cart"],
    ["orders", OrdersPage, "Orders unavailable", "Retry", "/api/orders"],
  ] as const)("shows an identity network failure on %s and rechecks identity before retrying", async (_name, Page, heading, retry, servicePath) => {
    let healthy = false;
    fetcher.mockImplementation(async input => {
      const path = String(input);
      if (path === "/api/auth/me") {
        if (!healthy) throw new Error("The connection was interrupted.");
        return Response.json(owner);
      }
      if (path === "/api/customer/profile") return new Promise<Response>(() => {});
      if (path === servicePath) return Response.json(servicePath === "/api/cart" ? emptyCart() : []);
      throw new Error(`Unexpected request ${path}`);
    });
    render(createElement(Page));
    await screen.findByRole("heading", { name: heading });
    expect(screen.getByText("The connection was interrupted.")).toBeTruthy();
    expect(fetcher.mock.calls.some(([input]) => String(input) === servicePath)).toBe(false);
    healthy = true;
    fireEvent.click(screen.getByRole("button", { name: retry }));
    await waitFor(() => expect(fetcher.mock.calls.some(([input]) => String(input) === servicePath)).toBe(true));
    await waitFor(() => expect(screen.queryByRole("heading", { name: heading })).toBeNull());
    expect(fetcher.mock.calls.filter(([input]) => String(input) === "/api/auth/me")).toHaveLength(2);
  });

  it.each([["cart", CartPage, "/api/cart"], ["orders", OrdersPage, "/api/orders"]] as const)("starts the authoritative %s read while optional profile hydration is pending", async (_name, Page, servicePath) => {
    const profile = deferred<Response>();
    fetcher.mockImplementation(async input => {
      const path = String(input);
      if (path === "/api/auth/me") return Response.json(owner);
      if (path === "/api/customer/profile") return profile.promise;
      if (path === servicePath) return Response.json(servicePath === "/api/cart" ? emptyCart() : []);
      throw new Error(`Unexpected request ${path}`);
    });
    render(createElement(Page));
    await waitFor(() => expect(fetcher.mock.calls.some(([input]) => String(input) === servicePath)).toBe(true));
    await waitFor(() => expect(screen.queryByText(/Loading your (Craves cart|orders)/)).toBeNull());
    await act(async () => { profile.resolve(Response.json({}, { status: 503 })); });
  });

  it("clears previous orders on owner change and discards their delayed refresh", async () => {
    const second = { ...owner, id: "66666666-6666-4666-8666-666666666666" };
    let identity = owner;
    let delayed = false;
    const late = deferred<Response>();
    fetcher.mockImplementation(async input => {
      const path = String(input);
      if (path === "/api/auth/me") return Response.json(identity);
      if (path === "/api/customer/profile") return Response.json({}, { status: 503 });
      if (path === "/api/orders") return delayed && identity.id === owner.id ? late.promise : Response.json([order(identity.id === owner.id ? "First private kitchen" : "Second private kitchen")]);
      throw new Error(`Unexpected request ${path}`);
    });
    render(createElement(OrdersPage));
    await screen.findByText("First private kitchen");
    delayed = true;
    fireEvent.click(screen.getByRole("button", { name: "Refresh orders" }));
    await waitFor(() => expect(fetcher.mock.calls.filter(([input]) => String(input) === "/api/orders")).toHaveLength(2));
    identity = second;
    act(() => { setSessionIdentity(second); });
    expect(screen.queryByText("First private kitchen")).toBeNull();
    await screen.findByText("Second private kitchen");
    await act(async () => { late.resolve(Response.json([order("Stale private kitchen")])); });
    expect(screen.queryByText("Stale private kitchen")).toBeNull();
    expect(screen.getByText("Second private kitchen")).toBeTruthy();
  });
});

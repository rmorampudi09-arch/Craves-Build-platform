// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ComponentType } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { BottomNav } from "../components/layout/BottomNav";

const fixture = vi.hoisted(() => ({ pathname: "/chef", count: 2, imports: 0, subscribers: new Set<() => void>() }));
vi.mock("next/navigation", () => ({ usePathname: () => fixture.pathname }));
vi.mock("../services/api/cravesCart", () => ({
  cartCount: () => fixture.count,
  cartTotal: () => fixture.count * 100,
  cartCurrency: () => "INR",
  subscribeCart: (listener: () => void) => {
    fixture.subscribers.add(listener);
    return () => { fixture.subscribers.delete(listener); };
  },
}));
vi.mock("next/dynamic", async () => {
  const { createElement, lazy, Suspense } = await import("react");
  return {
    default: (loader: () => Promise<{ default: ComponentType }>, options: { loading: ComponentType }) => {
      const Deferred = lazy(async () => { fixture.imports += 1; return loader(); });
      return () => createElement(Suspense, { fallback: createElement(options.loading) }, createElement(Deferred));
    },
  };
});
beforeEach(() => {
  fixture.pathname = "/chef";
  fixture.count = 2;
  vi.stubGlobal("matchMedia", vi.fn((media: string) => ({ media, matches: true, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("customer navigation loading", () => {
  it("does not import customer animation code or subscribe to cart changes on hidden routes", () => {
    const view = render(createElement(BottomNav));
    for (const pathname of ["/", "/chef", "/chef/menu", "/admin", "/admin/accounts", "/cart", "/checkout", "/checkout/fixture/payment", "/sign-in", "/contact", "/privacy", "/terms", "/security", "/refunds-cancellations", "/products-pricing", "/confirmation"]) {
      fixture.pathname = pathname;
      view.rerender(createElement(BottomNav));
      expect(view.container.childElementCount).toBe(0);
      expect(fixture.subscribers.size).toBe(0);
    }
    expect(fixture.imports).toBe(0);
  });

  it("keeps the visible navigation destinations, active page and changing cart count", async () => {
    fixture.pathname = "/home";
    render(createElement(BottomNav));
    await act(async () => { await import("../components/layout/BottomNavContent"); });
    await screen.findByRole("navigation", { name: "Customer navigation" });
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBe("page");
    for (const [label, path] of [["Home", "/home"], ["Meal Subscription", "/subscriptions"], ["Chefs", "/chefs"], ["Profile", "/profile"], ["Cart, 2 items", "/cart"]]) {
      expect(screen.getByRole("link", { name: label }).getAttribute("href")).toBe(path);
    }
    expect(fixture.subscribers.size).toBe(1);
    act(() => { fixture.count = 3; fixture.subscribers.forEach(listener => listener()); });
    expect(screen.getByRole("link", { name: "Cart, 3 items" })).toBeTruthy();
  });

  it("cleans up hidden-route subscriptions and restores the current visible route after transitions", async () => {
    fixture.pathname = "/chefs";
    const view = render(createElement(BottomNav));
    await screen.findByRole("navigation", { name: "Customer navigation" });
    expect(screen.getByRole("link", { name: "Chefs" }).getAttribute("aria-current")).toBe("page");
    fixture.pathname = "/chef/profile";
    view.rerender(createElement(BottomNav));
    expect(screen.queryByRole("navigation", { name: "Customer navigation" })).toBeNull();
    expect(fixture.subscribers.size).toBe(0);
    fixture.count = 0;
    fixture.pathname = "/profile";
    view.rerender(createElement(BottomNav));
    await screen.findByRole("navigation", { name: "Customer navigation" });
    expect(screen.getByRole("link", { name: "Profile" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Cart" })).toBeTruthy();
    await waitFor(() => expect(fixture.subscribers.size).toBe(1));
  });
});

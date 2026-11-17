// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({ pathname: "/home" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("@/features/customer-shell/components/LiveOrderBubble", () => ({ LiveOrderBubble: () => null }));

import { BottomNav } from "./BottomNav";

afterEach(cleanup);

function tabBarAt(pathname: string) {
  route.pathname = pathname;
  const { container, unmount } = render(createElement(BottomNav));
  const shown = container.querySelector("[data-craves-bottom-nav]") !== null;
  unmount();
  return shown;
}

describe("customer tab bar", () => {
  it("is hidden on the public account deletion page and the delete page, with no spacer", () => {
    for (const pathname of ["/account-deletion", "/account/delete"]) expect(tabBarAt(pathname), pathname).toBe(false);
  });

  it("still shows on customer pages, including /account", () => {
    for (const pathname of ["/home", "/account"]) expect(tabBarAt(pathname), pathname).toBe(true);
  });

  it("marks a tab on pages reached from it: Orders, Alerts, lists and group orders under Profile, dishes under Home", () => {
    const tabAt = (pathname: string) => {
      route.pathname = pathname;
      const { container, unmount } = render(createElement(BottomNav));
      const current = [...container.querySelectorAll("a[aria-current='page']")].map((link) => link.textContent?.trim());
      unmount();
      return current;
    };
    expect(tabAt("/orders")).toEqual(["Profile"]);
    expect(tabAt("/notifications")).toEqual(["Profile"]);
    expect(tabAt("/lists")).toEqual(["Profile"]);
    expect(tabAt("/group-orders/2b3c4d5e-6f70-4a8b-9c0d-1e2f3a4b5c6d")).toEqual(["Profile"]);
    expect(tabAt("/dish/1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c51")).toEqual(["Home"]);
    expect(tabAt("/kitchen/9089b0e4-d0df-446d-9d05-518fe64086ea")).toEqual(["Kitchens"]);
    expect(tabAt("/subscriptions/plans")).toEqual(["Meal plans"]);
  });
});

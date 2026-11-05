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
});

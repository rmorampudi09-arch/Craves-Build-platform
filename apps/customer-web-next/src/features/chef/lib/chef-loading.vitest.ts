// @vitest-environment jsdom
import { createElement } from "react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ChefLoading, chefLoadingShapeFor } from "@/features/chef/components/chef-loading";
import { ChefFlash } from "@/features/chef/components/chef-ui";

// Browsers send "animationend"; without AnimationEvent (jsdom) React would wait for "webkitAnimationEnd".
vi.hoisted(() => {
  window.AnimationEvent ??= Event as unknown as typeof AnimationEvent;
});
import { CustomerSectionSkeleton } from "@/shared/components/loading/CustomerPageSkeleton";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("loading states", () => {
  it("gives each chef page its own loading shape", () => {
    expect(chefLoadingShapeFor("/chef")).toBe("dashboard");
    expect(chefLoadingShapeFor("/chef/orders")).toBe("orders");
    expect(chefLoadingShapeFor("/chef/orders/0bde0000-0000-4000-8000-000000000010")).toBe("order");
    expect(chefLoadingShapeFor("/chef/menu")).toBe("menu");
    expect(chefLoadingShapeFor("/chef/earnings")).toBe("earnings");
    expect(chefLoadingShapeFor("/chef/finance")).toBe("money");
    expect(chefLoadingShapeFor("/chef/bank")).toBe("bank");
    expect(chefLoadingShapeFor("/chef/statements")).toBe("statements");
    // Meal plans are a "coming soon" card for now, not the plan manager.
    expect(chefLoadingShapeFor("/chef/meal-plans")).toBe("soon");
    expect(chefLoadingShapeFor("/chef/profile")).toBe("more");
    expect(chefLoadingShapeFor("/chef/capacity")).toBe("form");
    expect(chefLoadingShapeFor(null)).toBe("form");
  });

  it("names the wait for screen readers, then says what to check after 10 seconds", () => {
    vi.useFakeTimers();
    render(createElement(ChefLoading, { shape: "orders", label: "Loading chef orders" }));
    expect(screen.getByRole("status").textContent).toBe("Loading chef orders");
    act(() => vi.advanceTimersByTime(9_999));
    expect(screen.getByRole("status").textContent).toBe("Loading chef orders");
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("status").textContent).toBe("Still loading. Check your internet connection.");
  });

  it("draws a page's header the way the page does: Back link, button, or title alone", () => {
    const blocks = (shape: Parameters<typeof ChefLoading>[0]["shape"]) => {
      const view = render(createElement(ChefLoading, { shape, label: "Loading" }));
      const count = view.container.querySelectorAll(".chef-page-head .chef-skeleton").length;
      view.unmount();
      return count;
    };
    expect(blocks("earnings")).toBe(3); // title, line, Balance & payouts
    expect(blocks("statements")).toBe(3); // Back, title, line
    expect(blocks("soon")).toBe(2); // Back, title
    expect(blocks("more")).toBe(2); // title, line
  });

  it("does the same on customer pages that keep their own header", () => {
    vi.useFakeTimers();
    render(createElement(CustomerSectionSkeleton, { variant: "profile", label: "Loading your Craves profile" }));
    expect(screen.getByRole("status").textContent).toBe("Loading your Craves profile");
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole("status").textContent).toBe("Still loading. Check your internet connection.");
  });
});

describe("action messages", () => {
  it("let a success go when its wait ends, and keep an error until it is closed", () => {
    const onClose = vi.fn();
    const view = render(createElement(ChefFlash, { message: "Dish added", onClose }));
    expect(screen.getByRole("status").textContent).toBe("Dish added");
    // The 3.5 s wait is the message's own CSS animation: its end closes it, a child's does not.
    fireEvent.animationEnd(screen.getByRole("button", { name: "Close message" }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.animationEnd(screen.getByText("Dish added").parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);

    view.rerender(createElement(ChefFlash, { message: "That didn’t save", tone: "danger", onClose }));
    fireEvent.animationEnd(screen.getByRole("alert"));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close message" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

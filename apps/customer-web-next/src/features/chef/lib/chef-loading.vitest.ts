// @vitest-environment jsdom
import { createElement } from "react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { ChefLoading, chefLoadingShapeFor } from "@/features/chef/components/chef-loading";
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
    expect(chefLoadingShapeFor("/chef/finance")).toBe("money");
    expect(chefLoadingShapeFor("/chef/meal-plans")).toBe("plans");
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

  it("does the same on customer pages that keep their own header", () => {
    vi.useFakeTimers();
    render(createElement(CustomerSectionSkeleton, { variant: "profile", label: "Loading your Craves profile" }));
    expect(screen.getByRole("status").textContent).toBe("Loading your Craves profile");
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole("status").textContent).toBe("Still loading. Check your internet connection.");
  });
});

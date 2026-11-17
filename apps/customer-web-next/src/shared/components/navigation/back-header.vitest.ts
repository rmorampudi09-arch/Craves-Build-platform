// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/lists", useRouter: () => router }));

import { BackHeader } from "./BackHeader";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (window as { navigation?: unknown }).navigation;
});

describe("the back arrow on food list and group order pages", () => {
  it("goes back to the Craves page the person came from", () => {
    (window as { navigation?: unknown }).navigation = { currentEntry: { index: 2 } };
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    render(createElement(BackHeader, { title: "Food lists", backTo: "/profile", backLabel: "Back to profile" }));
    fireEvent.click(screen.getByRole("link", { name: "Back to profile" }));
    expect(back).toHaveBeenCalledOnce();
  });

  it("opens its own page when this tab started on this page", () => {
    (window as { navigation?: unknown }).navigation = { currentEntry: { index: 0 } };
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    render(createElement(BackHeader, { title: "Food lists", backTo: "/profile", backLabel: "Back to profile" }));
    const link = screen.getByRole("link", { name: "Back to profile" });
    expect(link.getAttribute("href")).toBe("/profile");
    fireEvent.click(link);
    expect(back).not.toHaveBeenCalled();
  });
});

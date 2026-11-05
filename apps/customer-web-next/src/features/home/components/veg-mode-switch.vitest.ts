// @vitest-environment jsdom
// A signed-out header; nothing is fetched.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { BrowseHeader } from "@/features/home/components/BrowseHeader";
import { getVegMode, setVegMode } from "@/shared/hooks/use-veg-mode";

const header = (onVegModeChange = vi.fn()) =>
  render(
    createElement(BrowseHeader, {
      locationLabel: "Kondapur", onOpenLocation: () => {}, cartCount: 0, onOpenCart: () => {}, onLogout: () => {},
      searchTerm: "", onSearchTermChange: () => {}, onSearchActivate: () => {}, vegToggle: true, onVegModeChange,
    }),
  );

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({})));
});
afterEach(() => {
  cleanup();
  setVegMode("off");
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

it("asks pure veg kitchens or veg dishes from every kitchen when Veg turns on, like Swiggy", async () => {
  const onVegModeChange = vi.fn();
  header(onVegModeChange);
  fireEvent.click(screen.getAllByRole("switch", { name: "Veg mode" })[0]);
  const sheet = await screen.findByRole("dialog", { name: "Veg mode" });
  // Nothing changes until a choice is made.
  expect(getVegMode()).toBe("off");
  fireEvent.click(within(sheet).getByRole("button", { name: /Pure veg kitchens only/ }));
  expect(getVegMode()).toBe("pure");
  expect(onVegModeChange).toHaveBeenCalledOnce();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  // The switch says which veg mode is on, and turning it off is one tap.
  const pure = screen.getAllByRole("switch", { name: "Pure veg mode" })[0];
  expect(pure.getAttribute("aria-checked")).toBe("true");
  fireEvent.click(pure);
  expect(getVegMode()).toBe("off");
});

it("closing the question leaves veg mode off", async () => {
  header();
  fireEvent.click(screen.getAllByRole("switch", { name: "Veg mode" })[0]);
  const sheet = await screen.findByRole("dialog", { name: "Veg mode" });
  fireEvent.click(within(sheet).getByRole("button", { name: "Keep veg mode off" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(getVegMode()).toBe("off");
  act(() => setVegMode("veg-dishes"));
  expect(screen.getAllByRole("switch", { name: "Veg mode" })[0].getAttribute("aria-checked")).toBe("true");
});

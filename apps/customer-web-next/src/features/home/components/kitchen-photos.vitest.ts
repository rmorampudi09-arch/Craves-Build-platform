// @vitest-environment jsdom
// Synthetic kitchen and photo URLs; nothing is fetched.
import { createElement, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => createElement("a", { href: to }, children),
}));

import { KitchensGrid } from "@/features/home/components/KitchensGrid";

afterEach(cleanup);

it("drops a kitchen photo that fails to load instead of showing a broken image", () => {
  const kitchen = {
    id: "4b1c0000-0000-4000-8000-000000000001", kitchenName: "Ammi's Dastarkhwan", displayName: null, description: null,
    areaName: "Tolichowki", city: "Hyderabad", state: "Telangana", distanceMeters: 3400, activeMenuItemCount: 4,
  };
  const [a, b] = ["https://img.craves.test/a.webp", "https://img.craves.test/b.webp"];
  const { container } = render(createElement(KitchensGrid, {
    kitchens: [kitchen], searchTerm: "", state: "ready", message: "",
    onSelectKitchen: () => {}, onRetry: () => {}, onManageAddress: () => {},
    dishImagesByKitchen: { [kitchen.id]: [a, b] },
  }));
  const photos = () => [...container.querySelectorAll("article img")].map((img) => img.getAttribute("src"));

  // Two photos plus the copy of the first that lets the slideshow loop.
  expect(photos()).toEqual([a, b, a]);
  fireEvent.error(container.querySelector(`article img[src="${b}"]`)!);
  expect(photos()).toEqual([a]);
  // With no photo left the card shows its chef-hat tile, not an empty or broken frame.
  fireEvent.error(container.querySelector("article img")!);
  expect(photos()).toEqual([]);
  expect(container.querySelector("article .aspect-\\[16\\/9\\] > svg")).toBeTruthy();
});

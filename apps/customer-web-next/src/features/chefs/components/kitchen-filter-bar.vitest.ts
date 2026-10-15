// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_KITCHEN_VIEW } from "@/features/chefs/lib/kitchen-filters";
import { KitchenFilterBar } from "./KitchenFilterBar";

afterEach(cleanup);

describe("Chefs tab filter bar", () => {
  it("applies Name A–Z and a spice level from the sheet together", () => {
    const onViewChange = vi.fn();
    render(createElement(KitchenFilterBar, { view: DEFAULT_KITCHEN_VIEW, onViewChange }));
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    expect(screen.getByRole("dialog", { name: "Filter and sort" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Name A–Z" }));
    fireEvent.click(screen.getByRole("radio", { name: "Mild" }));
    fireEvent.click(screen.getByRole("button", { name: "Show chefs" }));
    expect(onViewChange).toHaveBeenCalledWith({ sort: "name-a-z", spice: "MILD" });
  });

  it("shows an applied spice level as a chip that clears it", () => {
    const onViewChange = vi.fn();
    render(
      createElement(KitchenFilterBar, { view: { sort: "name-a-z", spice: "SPICY" }, onViewChange }),
    );
    expect(screen.getByRole("button", { name: /Filters/ }).textContent).toContain("1");
    expect(screen.getByRole("button", { name: "Name A–Z" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Spice: Spicy" }));
    expect(onViewChange).toHaveBeenCalledWith({ sort: "name-a-z", spice: "any" });
  });
});

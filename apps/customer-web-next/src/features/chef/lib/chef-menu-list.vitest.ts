// @vitest-environment jsdom
// The Menu list: search, pills, flags and Publish, with synthetic dishes; no backend is contacted.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChefMenuItem } from "./chef-menu-contract";
import { ChefMenuManager } from "../components/chef-menu-manager";

vi.mock("next/navigation", () => ({ usePathname: () => "/chef/menu", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const dish = (n: number, itemName: string, category: string, status: ChefMenuItem["status"], available: boolean, preparationTimeMinutes: number | null = 20): ChefMenuItem => ({
  id: `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`, itemName, description: null, category, foodType: "VEG", price: 180, currency: "INR", servesCount: null,
  preparationTimeMinutes, spiceLevel: null, unitPackageWeightGrams: 500, thermoboxRequired: false, available, status, images: [], createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z",
});
const kitchen = { id: "22222222-2222-4222-8222-222222222222", kitchenName: "Fixture kitchen", displayName: null, description: null, phoneNumber: null, email: null, addressLine1: "Fixture house", addressLine2: null, landmark: null, areaName: null, city: "Fixture city", state: "Fixture state", postalCode: null, latitude: null, longitude: null, status: "ACTIVE", createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z" };

function open(items: ChefMenuItem[]) {
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/chef/kitchen") return Response.json(kitchen);
    if (url === "/api/chef/menu") return Response.json(items);
    const put = items.find((item) => url === `/api/chef/menu/${item.id}` && init?.method === "PUT");
    if (put) return Response.json({ ...put, ...JSON.parse(String(init!.body)) });
    return Response.json({ code: "FEATURE_NOT_AVAILABLE" }, { status: 404 });
  });
  vi.stubGlobal("fetch", fetcher);
  render(createElement(ChefMenuManager));
  return fetcher;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Menu list", () => {
  it("counts the pills, flags what keeps customers out, and narrows by pill and search", async () => {
    open([dish(1, "Chicken dum biryani", "Biryani", "ACTIVE", true), dish(2, "Veg biryani", "Biryani", "ACTIVE", false), dish(3, "Idli", "Tiffins", "ACTIVE", true, null), dish(4, "Rasmalai", "Sweets", "DRAFT", false)]);
    const pills = await screen.findByRole("group", { name: "Show dishes" });
    expect(within(pills).getAllByRole("button").map((pill) => pill.textContent)).toEqual(["All 4", "On 2", "Off 1", "Drafts 1", "Biryani", "Tiffin", "Sweet Item"]);
    expect(screen.getByText("2 of 4 dishes customers can order")).toBeTruthy();
    expect(screen.getByText("Off for customers")).toBeTruthy();
    expect(screen.getByText("Prep time missing")).toBeTruthy();
    fireEvent.click(within(pills).getByRole("button", { name: "Biryani" }));
    expect(screen.queryByText("Idli")).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("Search dishes"), { target: { value: "paneer" } });
    expect(screen.getByRole("heading", { name: "No dishes match" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("Idli")).toBeTruthy();
    expect(within(pills).getByRole("button", { name: "All 4" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("publishes a draft after asking, with the dish as it is, on and orderable", async () => {
    const fetcher = open([dish(4, "Rasmalai", "Sweets", "DRAFT", false)]);
    fireEvent.click(await screen.findByRole("button", { name: "Publish Rasmalai" }));
    const dialog = await screen.findByRole("dialog", { name: "Publish Rasmalai?" });
    expect(within(dialog).getByText("It goes on your kitchen page and customers can order it.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Publish dish" }));
    expect(await screen.findByText("Rasmalai is live")).toBeTruthy();
    const put = fetcher.mock.calls.find(([, init]) => init?.method === "PUT")!;
    expect(JSON.parse(String(put[1]!.body))).toMatchObject({ itemName: "Rasmalai", status: "ACTIVE", available: true, unitPackageWeightGrams: 500 });
    await waitFor(() => expect(screen.getByRole("switch", { name: "Rasmalai available to order" })).toBeTruthy());
  });
});

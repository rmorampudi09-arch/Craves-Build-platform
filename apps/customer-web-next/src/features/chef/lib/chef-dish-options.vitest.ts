// @vitest-environment jsdom
// Synthetic dishes; no backend is contacted.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";
import { NextRequest } from "next/server";
import { createElement } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChefMenuItem } from "./chef-menu-contract";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/server-api", async (original) => ({
  ...(await original<typeof import("@/shared/lib/server-api")>()),
  authenticatedApiFetch: upstream,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/chef/menu",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
import { DELETE as deleteDish } from "@/app/api/chef/menu/[menuItemId]/route";
import { ChefMenuManager } from "../components/chef-menu-manager";

const DISH_ID = "11111111-1111-4111-8111-111111111111";
const dish: ChefMenuItem = {
  id: DISH_ID,
  itemName: "Fixture dish",
  description: "Slow cooked",
  category: "Meals",
  foodType: "VEG",
  price: 180,
  currency: "INR",
  servesCount: 2,
  preparationTimeMinutes: 30,
  spiceLevel: "MILD",
  unitPackageWeightGrams: 500,
  thermoboxRequired: true,
  available: true,
  status: "ACTIVE",
  images: [],
  createdAt: "2026-10-02T00:00:00Z",
  updatedAt: "2026-10-02T00:00:00Z",
};
const kitchen = {
  id: DISH_ID,
  kitchenName: "Fixture kitchen",
  displayName: null,
  description: null,
  phoneNumber: null,
  email: null,
  addressLine1: "Fixture house",
  addressLine2: null,
  landmark: null,
  areaName: null,
  city: "Fixture city",
  state: "Fixture state",
  postalCode: null,
  latitude: null,
  longitude: null,
  status: "DRAFT",
  createdAt: "2026-10-02T00:00:00Z",
  updatedAt: "2026-10-02T00:00:00Z",
};
const remove = (origin = "https://craves.in") =>
  new NextRequest(`https://craves.in/api/chef/menu/${DISH_ID}`, {
    method: "DELETE",
    headers: { origin },
  });
const params = (menuItemId = DISH_ID) => ({ params: Promise.resolve({ menuItemId }) });

beforeEach(() => {
  upstream.mockReset();
}); // braces: a returned function would run as teardown
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DELETE /api/chef/menu/[menuItemId]", () => {
  it("archives the dish and answers 204", async () => {
    upstream.mockResolvedValue(new Response(null, { status: 204 }));
    const response = await deleteDish(remove(), params());
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(upstream.mock.calls[0].slice(1)).toEqual([
      `/kitchens/me/menu-items/${DISH_ID}`,
      { method: "DELETE" },
    ]);
  });

  it("refuses other sites and bad ids before calling catalog", async () => {
    expect((await deleteDish(remove("https://evil.example"), params())).status).toBe(403);
    expect((await deleteDish(remove(), params("not-a-dish"))).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    [new Response(null, { status: 404 }), 404, "FEATURE_NOT_AVAILABLE"],
    [Response.json({ code: "MENU_ITEM_NOT_FOUND" }, { status: 404 }), 404, "MENU_ITEM_NOT_FOUND"],
    [Response.json({ code: "MENU_ITEM_IN_USE" }, { status: 409 }), 409, "MENU_ITEM_IN_USE"],
    [new Response(null, { status: 401 }), 401, "SESSION_EXPIRED"],
    [new Response(null, { status: 500 }), 503, "MENU_ITEM_DELETE_FAILED"],
  ])("maps upstream %# to %s %s", async (answer, status, code) => {
    upstream.mockResolvedValue(answer);
    const response = await deleteDish(remove(), params());
    expect([response.status, (await response.json()).code]).toEqual([status, code]);
  });
});

// The whole dish form renders each time: give a busy machine room.
describe("Dish options", { timeout: 20_000 }, () => {
  let stored: ChefMenuItem[];
  let deleteAnswer: () => Response;
  const fetcher = vi.fn<typeof fetch>();
  beforeAll(() => {
    MotionGlobalConfig.skipAnimations = true;
  });
  afterAll(() => {
    MotionGlobalConfig.skipAnimations = false;
  });
  beforeEach(() => {
    stored = [dish];
    deleteAnswer = () => new Response(null, { status: 204 });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })),
    );
    vi.stubGlobal("scrollTo", vi.fn());
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    fetcher.mockReset();
    fetcher.mockImplementation(async (input, options) => {
      const url = String(input);
      if (url === "/api/chef/kitchen") return Response.json(kitchen);
      if (url === "/api/chef/menu" && !options?.method) return Response.json(stored);
      if (url === "/api/chef/menu" && options?.method === "POST") {
        const item = {
          ...dish,
          ...JSON.parse(String(options.body)),
          id: "22222222-2222-4222-8222-222222222222",
        };
        stored = [...stored, item];
        return Response.json(item, { status: 201 });
      }
      if (url === `/api/chef/menu/${DISH_ID}` && options?.method === "DELETE") {
        const answer = deleteAnswer();
        if (answer.ok) stored = [];
        return answer;
      }
      throw new Error(`Unexpected menu route ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);
  });

  async function openOptions() {
    render(createElement(ChefMenuManager));
    fireEvent.click(await screen.findByRole("button", { name: "Edit Fixture dish" }));
    fireEvent.click(screen.getByRole("button", { name: "Dish options" }));
    await screen.findByRole("dialog", { name: "Dish options" });
  }

  it("duplicates into a new draft and saves it with the normal create", async () => {
    await openOptions();
    fireEvent.click(screen.getByRole("button", { name: /Duplicate dish/ }));
    await screen.findByRole("heading", { name: "Add a dish" });
    expect((screen.getByLabelText(/Dish name/) as HTMLInputElement).value).toBe(
      "Copy of Fixture dish",
    );
    fireEvent.click(screen.getByRole("button", { name: "Save dish" }));
    await screen.findByText("Dish added");
    const created = JSON.parse(
      String(fetcher.mock.calls.find(([, options]) => options?.method === "POST")![1]!.body),
    );
    expect(created).toMatchObject({
      itemName: "Copy of Fixture dish",
      category: "Meals",
      price: 180,
      servesCount: 2,
      spiceLevel: "MILD",
      thermoboxRequired: true,
      available: false,
      status: "DRAFT",
    });
  });

  it("asks before a duplicate replaces unsaved changes", async () => {
    render(createElement(ChefMenuManager));
    fireEvent.click(await screen.findByRole("button", { name: "Edit Fixture dish" }));
    fireEvent.change(screen.getByLabelText(/Dish name/), { target: { value: "Edited dish" } });
    fireEvent.click(screen.getByRole("button", { name: "Dish options" }));
    fireEvent.click(await screen.findByRole("button", { name: /Duplicate dish/ }));
    await screen.findByRole("dialog", { name: "Discard your changes?" });
    expect((screen.getByLabelText(/Dish name/) as HTMLInputElement).value).toBe("Edited dish");
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await screen.findByRole("heading", { name: "Add a dish" });
    expect((screen.getByLabelText(/Dish name/) as HTMLInputElement).value).toBe(
      "Copy of Fixture dish",
    );
  });

  it("deletes only after the chef confirms", async () => {
    await openOptions();
    fireEvent.click(screen.getByRole("button", { name: "Delete dish" }));
    await screen.findByRole("dialog", { name: "Delete Fixture dish?" });
    expect(fetcher.mock.calls.some(([, options]) => options?.method === "DELETE")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Delete dish" }));
    expect(await screen.findByText("Fixture dish deleted")).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Edit Fixture dish" })).toBeNull(),
    );
  });

  it("says deleting is coming soon when the route is not published, and keeps the dish", async () => {
    deleteAnswer = () => Response.json({ code: "FEATURE_NOT_AVAILABLE" }, { status: 404 });
    await openOptions();
    fireEvent.click(screen.getByRole("button", { name: "Delete dish" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete dish" }));
    expect(await screen.findByText("Deleting dishes is coming soon.")).toBeTruthy();
    expect((screen.getByLabelText(/Dish name/) as HTMLInputElement).value).toBe("Fixture dish");
  });
});

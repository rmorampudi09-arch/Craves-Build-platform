// @vitest-environment jsdom
// Rendered Daily limits against a fixture BFF; no backend is contacted.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MotionGlobalConfig } from "framer-motion";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ChefDailyLimits } from "../components/chef-daily-limits";

const PLAN_ID = "7f639200-0000-4000-8000-0000000000a1";
const CHEF = "1d000000-0000-4000-8000-000000000001";
const DISH = "44444444-4444-4444-8444-444444444444";
const at = "2026-10-01T00:00:00Z";
const rule = (day: number) => ({
  id: `5a00000${day}-0000-4000-8000-000000000001`,
  chefIdentityId: CHEF,
  isoDayOfWeek: day,
  mealSlotCode: "DINNER",
  totalCapacityUnits: 30,
  subscriptionCapacityUnits: 12,
  salesEnabled: true,
  recurringReservedUnits: 5,
  recurringAvailableUnits: 7,
  recurringDeficitUnits: 0,
  version: 1,
  updatedAt: at,
});
const schedule = {
  planId: PLAN_ID,
  recurrenceType: "WEEKLY",
  timezone: "Asia/Kolkata",
  generationLeadHours: 24,
  status: "ACTIVE",
  version: 1,
  createdAt: at,
  updatedAt: at,
  activatedAt: null,
  items: [1, 3].map((day) => ({
    id: `0000000${day}-0000-4000-8000-000000000000`,
    menuItemId: DISH,
    menuItemName: "Dal fry",
    quantity: 1,
    isoDayOfWeek: day,
    dayOfMonth: null,
    mealSlotCode: "DINNER",
    serviceTime: "19:30:00",
    sequenceNumber: 1,
  })),
};
const dish = {
  id: DISH,
  itemName: "Dal fry",
  description: null,
  category: "Main course",
  foodType: "VEG",
  price: 120,
  currency: "INR",
  servesCount: 1,
  preparationTimeMinutes: 20,
  spiceLevel: null,
  unitPackageWeightGrams: 400,
  thermoboxRequired: false,
  available: true,
  status: "ACTIVE",
  images: [],
  createdAt: at,
  updatedAt: at,
};
let capacity: Record<string, unknown>;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
const puts = (path: string) =>
  fetcher.mock.calls
    .filter(
      ([url, init]) => url === `/api/chef/subscription-capacity/${path}` && init?.method === "PUT",
    )
    .map(([, init]) => JSON.parse(String(init?.body)));

async function route(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  if (url === "/api/chef/subscription-capacity") return Response.json(capacity);
  if (url.startsWith("/api/chef/subscription-capacity/") && init?.method === "PUT")
    return Response.json({ saved: true });
  if (url === `/api/chef/subscription-plans/${PLAN_ID}/schedule`) return Response.json(schedule);
  if (url === "/api/chef/subscription-plans") return Response.json([]);
  if (url === "/api/chef/menu") return Response.json([dish]);
  throw new Error(`Unexpected fixture route ${url}`);
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  capacity = {
    chefIdentityId: CHEF,
    adminSalesFrozen: false,
    freezeReason: null,
    slotRules: [rule(1), rule(3)],
    menuItemRules: [],
    dateOverrides: [],
    menuItemDateOverrides: [],
    openIncidentCount: 0,
  };
  fetcher = vi.fn<typeof fetch>(route);
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Chef daily limits", { timeout: 20_000 }, () => {
  it("opens on the plan's meal and days, shows booked plates and saves each day with the switch", async () => {
    render(createElement(ChefDailyLimits, { planId: PLAN_ID }));
    await screen.findByRole("heading", { name: "Dinner on Mon, Wed" });
    expect(
      screen.getByText("5 subscriber plates booked · 7 free · 18 for normal orders"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Fewer total plates" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Kept for subscribers" }), {
      target: { value: "40" },
    });
    expect(
      (screen.getByRole("textbox", { name: "Kept for subscribers" }) as HTMLInputElement).value,
    ).toBe("29");
    fireEvent.click(screen.getByRole("switch", { name: "New subscribers can join" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Limits saved");
    expect(puts("rules/slots")).toEqual(
      [1, 3].map((isoDayOfWeek) => ({
        isoDayOfWeek,
        mealSlotCode: "DINNER",
        totalCapacityUnits: 29,
        subscriptionCapacityUnits: 29,
        salesEnabled: false,
        reason: "Updated by Chef in Craves web",
      })),
    );
  });

  it("sets a dish's limit and closes a meal for one date", async () => {
    render(createElement(ChefDailyLimits, { planId: PLAN_ID }));
    fireEvent.click(await screen.findByRole("button", { name: /Limits per dish/ }));
    const dishSheet = await screen.findByRole("dialog", { name: "Limits per dish" });
    fireEvent.click(
      within(dishSheet).getByRole("switch", { name: "Subscribers can order this dish" }),
    );
    fireEvent.click(within(dishSheet).getByRole("button", { name: "Save dish limit" }));
    await screen.findByText("Dish limit saved");
    expect(
      puts("rules/menu-items").map((body) => [
        body.menuItemId,
        body.isoDayOfWeek,
        body.maxSubscriptionUnits,
        body.salesEnabled,
      ]),
    ).toEqual([
      [DISH, 1, 10, false],
      [DISH, 3, 10, false],
    ]);

    fireEvent.click(await screen.findByRole("button", { name: /Change a single date/ }));
    const dateSheet = await screen.findByRole("dialog", { name: "Change a single date" });
    expect(
      (within(dateSheet).getByRole("button", { name: "Save date" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.change(within(dateSheet).getByLabelText("Date"), { target: { value: "2099-01-05" } });
    fireEvent.click(within(dateSheet).getByRole("switch", { name: "Close dinner on this day" }));
    fireEvent.click(within(dateSheet).getByRole("button", { name: "Save date" }));
    await screen.findByText("Date saved");
    expect(puts("overrides/slots")).toEqual([
      {
        serviceDate: "2099-01-05",
        mealSlotCode: "DINNER",
        totalCapacityUnits: 30,
        subscriptionCapacityUnits: 12,
        closed: true,
        reason: "Date override updated by Chef in Craves web",
      },
    ]);
  });

  it("disables every change while Craves has frozen new subscriptions", async () => {
    capacity = { ...capacity, adminSalesFrozen: true, freezeReason: "Kitchen check pending." };
    render(createElement(ChefDailyLimits, { planId: null }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Craves has paused new subscriptions for now. Kitchen check pending.",
    );
    // No weekly plan says which days: Monday to Friday, Lunch first.
    expect(screen.getByRole("heading", { name: "Every weekday lunch" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("textbox", { name: "Total plates" }).matches(":disabled")).toBe(true);
    expect(
      screen.getByRole("switch", { name: "New subscribers can join" }).matches(":disabled"),
    ).toBe(true);
  });

  it("says Coming soon when the backend has no daily limits yet", async () => {
    fetcher.mockImplementation(async (input, init) =>
      String(input) === "/api/chef/subscription-capacity"
        ? Response.json({ code: "FEATURE_NOT_AVAILABLE" }, { status: 404 })
        : route(input, init),
    );
    render(createElement(ChefDailyLimits, { planId: PLAN_ID }));
    expect(await screen.findByText("Daily limits are on their way")).toBeTruthy();
  });
});

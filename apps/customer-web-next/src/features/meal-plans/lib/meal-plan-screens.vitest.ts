// @vitest-environment jsdom
// Synthetic meal plans; no backend is contacted.
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/features/auth/api/cravesAuth", () => ({
  getAddress: () => ({ lat: 17.44, lng: 78.38 }),
}));
import { SubscriptionDetails } from "@/features/meal-plans/components/subscription-details";
import { SubscriptionManager } from "@/features/meal-plans/components/subscription-manager";

const ID = "11111111-1111-4111-8111-111111111111";
const PLAN = "22222222-2222-4222-8222-222222222222";
const OTHER_PLAN = "33333333-3333-4333-8333-333333333333";
const ORDER = "44444444-4444-4444-8444-444444444444";
const DISH = "55555555-5555-4555-8555-555555555555";
const KITCHEN = "66666666-6666-4666-8666-666666666666";
const ADDRESS = "77777777-7777-4777-8777-777777777777";
const policy = {
  customerPauseEnabled: true,
  customerResumeEnabled: true,
  customerCancelEnabled: true,
  customerSkipEnabled: true,
  pauseCutoffMinutes: 0,
  resumeLeadMinutes: 0,
  cancelCutoffMinutes: 0,
  skipCutoffMinutes: 0,
  holidayPolicyReference: null,
  unusedMealPolicyReference: null,
  refundPolicyReference: null,
};
const subscription = (over: Record<string, unknown> = {}) => ({
  id: ID,
  planId: PLAN,
  status: "ACTIVE",
  startDate: "2026-10-05",
  endDate: null,
  nextServiceDate: "2026-10-12",
  deliveryAddressId: ADDRESS,
  notes: null,
  createdAt: "2026-10-01T10:00:00Z",
  updatedAt: "2026-10-01T10:00:00Z",
  planName: "Weekly thali",
  pauseDaysPerBill: 3,
  pauseDaysLeft: 2,
  pauseAutoResumeDate: null,
  dayCredits: [],
  ...over,
});
const meal = {
  id: "88888888-8888-4888-8888-888888888888",
  serviceDate: "2099-10-12",
  mealSlotCode: "LUNCH",
  serviceAt: "2099-10-12T07:30:00Z",
  status: "ORDER_CREATED",
  items: [{ menuItemId: DISH, quantity: 2, sequenceNumber: 1 }],
  orderId: ORDER,
};
const schedule = {
  planId: PLAN,
  recurrenceType: "WEEKLY",
  timezone: "Asia/Kolkata",
  kitchenId: KITCHEN,
  items: [1, 2, 3, 4, 5].map((day) => ({
    menuItemId: DISH,
    itemName: "Dal rice",
    foodType: "VEG",
    imageUrl: null,
    quantity: 1,
    isoDayOfWeek: day,
    dayOfMonth: null,
    mealSlotCode: "LUNCH",
    serviceTime: "13:00:00",
    sequenceNumber: day,
  })),
};
const plan = (id: string, name: string, billingPeriod = "WEEKLY") => ({
  id,
  planCode: name,
  name,
  description: null,
  billingPeriod,
  amount: 1200,
  currency: "INR",
  imageUrl: null,
});

let current: Record<string, unknown> = subscription();
let mine: unknown[] = [];
const credit = {
  id: "99999999-9999-4999-8999-999999999999", kind: "PAUSE", firstDate: "2099-10-10", lastDate: "2099-10-12", mealSlotCode: null, days: 3,
  status: "PENDING_CHOICE", refundAmount: 360, currency: "INR", choiceDeadline: "2099-10-16T06:00:00Z", extendAvailable: true,
};

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
beforeEach(() => {
  current = subscription();
  mine = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") !== "GET") {
        if (!url.endsWith("/choice")) return Response.json({ code: "RESUME_AFTER_AUTO_RESTART" }, { status: 400 });
        current = subscription({ dayCredits: [{ ...credit, status: "EXTENDED" }] });
        return Response.json({ ...credit, status: "EXTENDED" });
      }
      if (url.endsWith("/policy")) return Response.json(policy);
      if (url.endsWith("/schedule"))
        return Response.json(
          url.includes(PLAN)
            ? schedule
            : { ...schedule, planId: OTHER_PLAN, kitchenId: null, items: [] },
        );
      if (url.includes("/occurrences")) return Response.json([meal]);
      if (url === "/api/customer/addresses")
        return Response.json([
          { id: ADDRESS, areaName: "Madhapur", districtName: null, city: "Hyderabad" },
        ]);
      if (url.startsWith("/api/subscriptions/plans"))
        return Response.json([
          plan(PLAN, "Weekly thali"),
          plan(OTHER_PLAN, "Fortnight tiffin", "FORTNIGHTLY"),
        ]);
      if (url.startsWith("/api/catalog/kitchens/"))
        return Response.json({
          id: KITCHEN,
          kitchenName: "Asha's Kitchen",
          displayName: null,
          status: "ACTIVE",
          createdAt: null,
        });
      if (url.startsWith("/api/reviews/kitchens/"))
        return Response.json({ kitchenId: KITCHEN, reviewCount: 12, overallAverage: 4.6 });
      if (url === "/api/subscriptions") return Response.json(mine);
      return Response.json(current);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)));

describe("meal plan page", () => {
  it("states the bill's pause allowance before pausing", async () => {
    render(createElement(SubscriptionDetails, { subscriptionId: ID }));
    expect(
      await screen.findByText(
        "2 pause days left this bill. Your plan restarts by itself after a pause.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(
      screen.getByText(
        /You can pause up to 2 more days this bill. Your plan restarts by itself after that./,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Meals stop until you resume/)).toBeNull();
    await settle();
  });

  it("turns Pause off when no pause days are left", async () => {
    current = subscription({ pauseDaysLeft: 0 });
    render(createElement(SubscriptionDetails, { subscriptionId: ID }));
    expect(
      (
        (await screen.findByRole("button", {
          name: "No pause days left this bill",
        })) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await settle();
  });

  it("shows the automatic restart and explains a resume after it", async () => {
    current = subscription({
      status: "PAUSED",
      pauseDaysLeft: 0,
      pauseAutoResumeDate: "2099-12-30",
    });
    render(createElement(SubscriptionDetails, { subscriptionId: ID }));
    expect(await screen.findByText("Restarts on Wed 30 Dec")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resume meal plan" }));
    expect((screen.getByLabelText("Restart meals on") as HTMLInputElement).max).toBe("2099-12-30");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Resume meal plan" }).at(-1)!);
    expect(
      await screen.findByText(
        "Your plan restarts by itself on Wed 30 Dec. Choose that day or earlier.",
      ),
    ).toBeTruthy();
    await settle();
  });

  it("opens a meal with its date, time, address, quantity and Track order", async () => {
    render(createElement(SubscriptionDetails, { subscriptionId: ID }));
    fireEvent.click(await screen.findByRole("button", { name: /Mon 12 Oct · Lunch/ }));
    const sheet = screen.getByRole("dialog", { name: "Lunch, Mon 12 Oct" });
    expect(within(sheet).getByText("Madhapur, Hyderabad")).toBeTruthy();
    expect(within(sheet).getByText("2 servings")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Track order" }).getAttribute("href")).toBe(
      `/orders/${ORDER}`,
    );
    await settle();
  });
});

describe("meal plans list", () => {
  it("opens on My plans while a plan runs and links ended plans to History", async () => {
    mine = [
      subscription(),
      subscription({ id: "99999999-9999-4999-8999-999999999999", status: "CANCELLED" }),
    ];
    render(createElement(SubscriptionManager));
    expect(
      (await screen.findByRole("tab", { name: "My plans" })).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByRole("link", { name: /History.*1/ }).getAttribute("href")).toBe(
      "/subscriptions/history",
    );
    expect(screen.getByRole("link", { name: /How meal plans work/ }).getAttribute("href")).toBe(
      "/subscriptions/how-it-works",
    );
    await settle();
  });

  it("opens on Explore with cards that search by plan or chef", async () => {
    render(createElement(SubscriptionManager));
    expect(
      (await screen.findByRole("tab", { name: "Explore plans" })).getAttribute("aria-selected"),
    ).toBe("true");
    expect(await screen.findByText("By Asha's Kitchen · 5 meals · Mon – Fri")).toBeTruthy();
    expect(screen.getByText("Veg")).toBeTruthy();
    expect(screen.getByLabelText("Rated 4.6 from 12 reviews")).toBeTruthy();
    expect(screen.getByText("/ 14 days")).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search meal plans or chefs" }), {
      target: { value: "asha" },
    });
    expect(screen.getByRole("heading", { name: "Weekly thali" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Fortnight tiffin" })).toBeNull();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search meal plans or chefs" }), {
      target: { value: "biryani" },
    });
    expect(screen.getByText("No plans match “biryani”.")).toBeTruthy();
    await settle();
  });
});

describe("refund or extra days", () => {
  it("offers both while the choice is open, asks first, then shows the outcome", async () => {
    current = subscription({ dayCredits: [credit] });
    render(createElement(SubscriptionDetails, { subscriptionId: ID }));
    expect(await screen.findByRole("heading", { name: "You paused 3 days" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Get a refund (₹360)" })).toBeTruthy();
    expect(screen.getByText("If you don’t choose by 11:30 am on Fri 16 Oct, we’ll add it at the end.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add 3 days at the end" }));
    const dialog = screen.getByRole("dialog", { name: "Add 3 days at the end?" });
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Add 3 days at the end" }));
    expect(await screen.findByText("3 days added at the end.")).toBeTruthy();
    const post = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[0]).toBe(`/api/subscriptions/${ID}/day-credits/${credit.id}/choice`);
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ choice: "EXTEND" });
    expect(screen.queryByRole("button", { name: /Get a refund/ })).toBeNull();
    await settle();
  });

  it("offers only a refund once the plan can't run longer", async () => {
    current = subscription({ dayCredits: [{ ...credit, extendAvailable: false }] });
    render(createElement(SubscriptionDetails, { subscriptionId: ID }));
    expect(await screen.findByRole("button", { name: "Get a refund (₹360)" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add 3 days at the end" })).toBeNull();
    await settle();
  });
});

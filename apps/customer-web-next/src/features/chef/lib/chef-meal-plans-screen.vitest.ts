// @vitest-environment jsdom
// Rendered plan list and editor against a fixture BFF; no backend is contacted.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MotionGlobalConfig } from "framer-motion";
import { createElement, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Language } from "@/shared/i18n/language";
import { LanguageProvider } from "@/shared/i18n/language-context";
import { ChefSubscriptionPlanManager } from "../components/chef-subscription-plan-manager";

// LanguageProvider types children as a prop; createElement passes them as its third argument.
const Provider = LanguageProvider as (props: { initial: Language; chosen: boolean; children?: ReactNode }) => ReactNode;

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const PLAN_ID = "7f639200-0000-4000-8000-0000000000a1";
const NEW_ID = "7f639200-0000-4000-8000-0000000000b2";
const DISH = "44444444-4444-4444-8444-444444444444";
const base = {
  id: PLAN_ID,
  planCode: "PLAN_1",
  name: "Home lunch",
  description: "Fresh lunches",
  billingPeriod: "WEEKLY",
  amount: 1499,
  currency: "INR",
  status: "ACTIVE",
  reviewReason: null,
  submittedAt: null,
  reviewedAt: null,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  imageUrl: null,
  acceptingSubscribers: true,
  activeSubscriberCount: 8,
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
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};
const schedule = {
  planId: PLAN_ID,
  recurrenceType: "WEEKLY",
  timezone: "Asia/Kolkata",
  generationLeadHours: 24,
  status: "ACTIVE",
  version: 1,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  activatedAt: null,
  items: [1, 2, 3, 4, 5].map((day) => ({
    id: `0000000${day}-0000-4000-8000-000000000000`,
    menuItemId: DISH,
    menuItemName: "Dal fry",
    quantity: 1,
    isoDayOfWeek: day,
    dayOfMonth: null,
    mealSlotCode: "LUNCH",
    serviceTime: "12:30:00",
    sequenceNumber: 1,
  })),
};

let plans: Record<string, unknown>[];
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
const calls = (method: string, path: string | RegExp) =>
  fetcher.mock.calls.filter(
    ([url, init]) =>
      (init?.method ?? "GET") === method &&
      (typeof path === "string" ? url === path : path.test(String(url))),
  );
const sent = (method: string, path: string | RegExp) =>
  calls(method, path).map(([, init]) => JSON.parse(String(init?.body)));

async function route(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input),
    method = init?.method ?? "GET";
  if (url === "/api/chef/menu") return Response.json([dish]);
  if (url === "/api/chef/subscription-plans" && method === "GET") return Response.json(plans);
  if (url === "/api/chef/subscription-plans" && method === "POST") {
    const created = {
      ...base,
      ...JSON.parse(String(init?.body)),
      id: NEW_ID,
      status: "DRAFT",
      acceptingSubscribers: true,
      activeSubscriberCount: 0,
    };
    plans = [created, ...plans];
    return Response.json(created, { status: 201 });
  }
  if (/\/schedule$/.test(url) && method === "GET")
    return url.includes(PLAN_ID)
      ? Response.json(schedule)
      : Response.json({ code: "PLAN_SCHEDULE_NOT_FOUND" }, { status: 404 });
  if (/\/schedule$/.test(url) && method === "PUT")
    return Response.json({ ...schedule, planId: NEW_ID, status: "DRAFT", items: [] });
  if (/\/submit$/.test(url)) return Response.json({ ...plans[0], status: "PENDING_APPROVAL" });
  if (/\/accepting-subscribers$/.test(url))
    return Response.json({
      ...base,
      acceptingSubscribers: JSON.parse(String(init?.body)).acceptingSubscribers,
    });
  if (url === "/api/support/cases") {
    const summary = {
      id: "5a0c0000-0000-4000-8000-0000000000c1",
      caseNumber: "CRV-5A0C0000000040008000000ABCDE",
      requesterRole: "CHEF",
      orderId: null,
      subject: "x",
      status: "OPEN",
      lastRequesterMessageAt: null,
      lastSupportMessageAt: null,
      resolvedAt: null,
      closedAt: null,
      createdAt: "2026-10-10T08:00:00Z",
      updatedAt: "2026-10-10T08:00:00Z",
    };
    return Response.json({ ...summary, messages: [] }, { status: 201 });
  }
  throw new Error(`Unexpected fixture route ${method} ${url}`);
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  router.push.mockReset();
  plans = [];
  fetcher = vi.fn<typeof fetch>(route);
  vi.stubGlobal("fetch", fetcher);
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function startPlan() {
  render(createElement(ChefSubscriptionPlanManager));
  fireEvent.click(await screen.findByRole("button", { name: "Create a plan" }));
  await screen.findByRole("heading", { name: "New meal plan" });
}
function fillDetails() {
  fireEvent.change(screen.getByLabelText(/Plan name/), { target: { value: "Weekday lunch" } });
  fireEvent.change(screen.getByLabelText("Price per week"), { target: { value: "999" } });
  fireEvent.change(screen.getByLabelText(/^Description/), {
    target: { value: "Dal, rice and a sabzi" },
  });
}

// Whole journeys through the editor: slow on a busy machine.
describe("Chef meal plans", { timeout: 20_000 }, () => {
  it("lists plans with filters, review reasons, the subscriber switch and links", async () => {
    plans = [
      base,
      {
        ...base,
        id: NEW_ID,
        name: "Dinner box",
        status: "REJECTED",
        reviewReason: "Add a photo",
        acceptingSubscribers: null,
        activeSubscriberCount: null,
      },
    ];
    render(createElement(ChefSubscriptionPlanManager));
    await screen.findByText("8 subscribers");
    expect(screen.getByText("Craves asked for changes: Add a photo")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Daily limits" }).getAttribute("href")).toBe(
      `/chef/capacity?plan=${PLAN_ID}`,
    );
    await screen.findByText("Weekly · Lunch · Mon – Fri");

    fireEvent.click(screen.getByRole("switch", { name: "Home lunch taking new subscribers" }));
    await screen.findByText("Current subscribers keep getting meals.");
    expect(sent("PATCH", /accepting-subscribers$/)).toEqual([{ acceptingSubscribers: false }]);

    fireEvent.click(screen.getByRole("button", { name: "Drafts 1" }));
    expect(screen.queryByText("8 subscribers")).toBeNull();
    expect(screen.getByRole("button", { name: /^Dinner box, Changes requested/ })).toBeTruthy();
  });

  it("builds a plan in three steps and submits it for approval", async () => {
    await startPlan();
    fireEvent.click(screen.getByRole("button", { name: "Next: Meals" }));
    expect(screen.getByText("Enter a plan name.")).toBeTruthy();
    fillDetails();
    fireEvent.click(screen.getByRole("button", { name: "Next: Meals" }));
    expect(screen.getByRole("tab", { name: "Sunday" }).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Add a meal for Sunday" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Add a meal for Sun" })).getByRole(
        "button",
        { name: "Lunch" },
      ),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Lunch dish, not selected" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Pick a dish" })).getByRole("button", {
        name: /Dal fry/,
      }),
    );
    await screen.findByRole("button", { name: "Lunch dish, Dal fry" });
    fireEvent.click(screen.getByRole("button", { name: "More lunch portions" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy Sunday to all weekdays" }));
    fireEvent.keyDown(screen.getByRole("tab", { name: "Sunday, has meals" }), {
      key: "ArrowRight",
    });
    expect(
      screen.getByRole("tab", { name: "Monday, has meals" }).getAttribute("aria-selected"),
    ).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Next: Review" }));
    expect(await screen.findByText("Sun – Fri · Lunch 12:30 PM")).toBeTruthy();
    expect(screen.getByText("Dal fry × 2")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Note for Craves (optional)"), {
      target: { value: "First plan" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit for approval" }));

    await screen.findByText("Sent to Craves for approval");
    expect(sent("POST", "/api/chef/subscription-plans")).toEqual([
      {
        name: "Weekday lunch",
        description: "Dal, rice and a sabzi",
        billingPeriod: "WEEKLY",
        amount: 999,
        currency: "INR",
      },
    ]);
    const [week] = sent("PUT", `/api/chef/subscription-plans/${NEW_ID}/schedule`);
    expect([
      week.recurrenceType,
      week.generationLeadHours,
      week.items.length,
      week.items[0],
    ]).toEqual([
      "WEEKLY",
      24,
      6,
      {
        menuItemId: DISH,
        quantity: 2,
        isoDayOfWeek: 1,
        dayOfMonth: null,
        mealSlotCode: "LUNCH",
        serviceTime: "12:30",
        sequenceNumber: 1,
      },
    ]);
    expect(sent("POST", `/api/chef/subscription-plans/${NEW_ID}/submit`)).toEqual([
      { note: "First plan" },
    ]);
  });

  it("asks before leaving unsaved changes: keep editing, save a draft, or discard", async () => {
    await startPlan();
    fillDetails();
    fireEvent.click(screen.getByRole("button", { name: "Meal plans" }));
    const ask = await screen.findByRole("dialog", { name: "Save as draft?" });
    fireEvent.click(within(ask).getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("heading", { name: "New meal plan" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Meal plans" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Save as draft?" })).getByRole("button", {
        name: "Save draft",
      }),
    );
    await screen.findByText("Draft saved");
    expect(calls("POST", "/api/chef/subscription-plans")).toHaveLength(1);
    // No meals yet, so no schedule is sent.
    expect(calls("PUT", /\/schedule$/)).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "New plan" }));
    fireEvent.change(await screen.findByLabelText(/Plan name/), {
      target: { value: "Thrown away" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Meal plans" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Save as draft?" })).getByRole("button", {
        name: "Discard",
      }),
    );
    await screen.findByRole("heading", { name: "Meal plans" });
    expect(calls("POST", "/api/chef/subscription-plans")).toHaveLength(1);
  });

  it("asks before an in-app link leaves unsaved changes, then follows it", async () => {
    render(
      createElement(
        "div",
        null,
        createElement("a", { href: "/chef/orders" }, "Orders"),
        createElement(ChefSubscriptionPlanManager),
      ),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Create a plan" }));
    fillDetails();
    fireEvent.click(screen.getByRole("link", { name: "Orders" }));
    const ask = await screen.findByRole("dialog", { name: "Save as draft?" });
    fireEvent.click(within(ask).getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("link", { name: "Orders" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Save as draft?" })).getByRole("button", {
        name: "Save draft",
      }),
    );
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/chef/orders"));
    expect(calls("POST", "/api/chef/subscription-plans")).toHaveLength(1);

    router.push.mockReset();
    fireEvent.change(screen.getByLabelText(/Plan name/), { target: { value: "Thrown away" } });
    fireEvent.click(screen.getByRole("link", { name: "Orders" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Save as draft?" })).getByRole("button", {
        name: "Discard",
      }),
    );
    expect(router.push).toHaveBeenCalledWith("/chef/orders");
    expect(calls("PUT", /subscription-plans\/[^/]+$/)).toHaveLength(0);
  });

  it("shows counts on the Menu toggle and keeps Menu as the way back from Daily limits", async () => {
    plans = [base];
    render(createElement(ChefSubscriptionPlanManager, { inMenu: true }));
    expect((await screen.findByRole("button", { name: /^Meal plans\s*1$/ })).getAttribute("aria-pressed")).toBe("true");
    await screen.findByRole("button", { name: /^Dishes\s*1$/ });
    expect(screen.getByRole("link", { name: "Daily limits" }).getAttribute("href")).toBe(
      `/chef/capacity?plan=${PLAN_ID}&from=menu`,
    );
  });

  it("reads in Telugu, and the old Meal plans page leads back to the Menu tab", async () => {
    plans = [base];
    render(createElement(Provider, { initial: "te", chosen: true }, createElement(ChefSubscriptionPlanManager)));
    await screen.findByText("8 సబ్‌స్క్రైబర్లు");
    expect(screen.getByRole("heading", { name: "మీల్ ప్లాన్‌లు" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "మెనూ" }).getAttribute("href")).toBe("/chef/menu?view=plans");
    expect(screen.getByRole("link", { name: "రోజువారీ పరిమితి" }).getAttribute("href")).toBe(
      `/chef/capacity?plan=${PLAN_ID}`,
    );
    await screen.findByText("ప్రతి వారం · మధ్యాహ్న భోజనం · సోమ – శుక్ర");
    expect(screen.getByRole("button", { name: "Home lunch, నడుస్తోంది, ₹1,499 వారానికి" })).toBeTruthy();
    // Request bodies stay English: the switch still sends the same field.
    fireEvent.click(screen.getByRole("switch", { name: "Home lunch — కొత్త సబ్‌స్క్రైబర్లను తీసుకుంటున్నారు" }));
    await screen.findByText("ఇప్పుడున్న సబ్‌స్క్రైబర్లకు భోజనం వస్తూనే ఉంటుంది.");
    expect(sent("PATCH", /accepting-subscribers$/)).toEqual([{ acceptingSubscribers: false }]);
  });

  it("shows a plan waiting approval read-only and sends a change request as a support ticket", async () => {
    plans = [{ ...base, status: "PENDING_APPROVAL" }];
    render(createElement(ChefSubscriptionPlanManager));
    fireEvent.click(await screen.findByRole("button", { name: /^Home lunch, Waiting approval/ }));
    await screen.findByText("Craves is checking this plan. You can’t edit it until then.", {
      selector: ".chef-notice *",
    });
    expect(screen.getByLabelText(/Plan name/).matches(":disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Request a change" }));
    const dialog = await screen.findByRole("dialog", { name: "Request a change" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send request" }));
    expect(within(dialog).getByRole("alert").textContent).toBe("Tell us what you want to change.");
    fireEvent.change(within(dialog).getByLabelText(/What should change/), {
      target: { value: "Raise the price to 1599" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send request" }));
    await within(dialog).findByText(/Request sent \(#ABCDE\)/);
    expect(sent("POST", "/api/support/cases")).toEqual([
      {
        contextRole: "CHEF",
        orderId: null,
        subject: "Change meal plan: Home lunch",
        message: "Raise the price to 1599",
      },
    ]);
  });

  it("says Coming soon when the backend has no meal plans yet, and keeps plans when the menu fails", async () => {
    fetcher.mockImplementation(async (input, init) =>
      String(input) === "/api/chef/subscription-plans"
        ? Response.json({ code: "FEATURE_NOT_AVAILABLE" }, { status: 404 })
        : route(input, init),
    );
    render(createElement(ChefSubscriptionPlanManager));
    await screen.findByText("Meal plans are on their way");
    expect((screen.getByRole("button", { name: "New plan" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    cleanup();

    plans = [base];
    fetcher.mockImplementation(async (input, init) =>
      String(input) === "/api/chef/menu"
        ? Response.json({ code: "KITCHEN_PROFILE_REQUIRED" }, { status: 400 })
        : route(input, init),
    );
    render(createElement(ChefSubscriptionPlanManager));
    expect(await screen.findByText("8 subscribers")).toBeTruthy();
    // Without a kitchen the dish picker points to kitchen setup, not to the connection.
    fireEvent.click(screen.getByRole("button", { name: "New plan" }));
    await screen.findByRole("heading", { name: "New meal plan" });
    fillDetails();
    fireEvent.click(screen.getByRole("button", { name: "Next: Meals" }));
    fireEvent.click(screen.getByRole("button", { name: "Add a meal for Sunday" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Add a meal for Sun" })).getByRole(
        "button",
        { name: "Lunch" },
      ),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Lunch dish, not selected" }));
    const picker = await screen.findByRole("dialog", { name: "Pick a dish" });
    expect(within(picker).getByRole("link", { name: "Set up my kitchen" }).getAttribute("href")).toBe(
      "/chef/kitchen",
    );
    expect(within(picker).queryByText(/Check your connection/)).toBeNull();
  });
});

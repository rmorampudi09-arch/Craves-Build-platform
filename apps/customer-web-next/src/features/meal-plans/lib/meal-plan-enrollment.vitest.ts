// @vitest-environment jsdom
// Synthetic plan and address; no meal plan is created.
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/shared/lib/session-fetch", () => ({ sessionFetch: (url: string, init?: RequestInit) => fetch(url, init) }));
import { SubscriptionEnrollmentForm } from "@/features/meal-plans/components/subscription-enrollment-form";
import { indiaBusinessDate } from "@/features/meal-plans/lib/subscription-contract";

const PLAN = "11111111-1111-4111-8111-111111111111";
const plan = { id: PLAN, name: "Weekly thali", description: null, billingPeriod: "WEEKLY", amount: 1200, currency: "INR" };
// Delivery-ready, as the app requires: a name, area, PIN code and map pin.
const address = {
  id: "66666666-6666-4666-8666-666666666666", addressLabel: "HOME", recipientName: "Asha", addressLine1: "Flat 302", areaName: "Banjara Hills",
  city: "Hyderabad", state: "Telangana", postalCode: "500034", latitude: 17.41, longitude: 78.44, isDefault: true, active: true,
};
const noPin = { ...address, id: "77777777-7777-4777-8777-777777777777", addressLabel: "WORK", addressLine1: "Tower B", latitude: null, longitude: null, isDefault: false };
const schedule = {
  planId: PLAN, recurrenceType: "WEEKLY", timezone: "Asia/Kolkata", kitchenId: null,
  items: [{ menuItemId: "88888888-8888-4888-8888-888888888888", itemName: "Dal rice", quantity: 2, isoDayOfWeek: 1, dayOfMonth: null, mealSlotCode: "LUNCH", serviceTime: "13:00:00", sequenceNumber: 1 }],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  router.push.mockReset();
});

function serve(answer: Response, mine: unknown[] = []) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/subscriptions/plans") return Response.json([plan]);
    if (url === `/api/subscriptions/plans/${PLAN}/schedule`) return Response.json(schedule);
    if (url === "/api/customer/addresses") return Response.json([address, noPin]);
    if (url === "/api/subscriptions" && init?.method === "POST") return answer;
    if (url === "/api/subscriptions") return Response.json(mine);
    return Response.json({}, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function startPlanAnswering(answer: Response) {
  serve(answer);
  render(createElement(SubscriptionEnrollmentForm, { planId: PLAN }));
  const next = await screen.findByRole("button", { name: "Continue to payment" });
  await waitFor(() => expect((next as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(next);
}

it("says new meal plans are paused, with a link to keep the account, when an account deletion is open", async () => {
  await startPlanAnswering(Response.json({ code: "ACCOUNT_DELETION_PENDING" }, { status: 409 }));

  expect((await screen.findByRole("alert")).textContent).toContain("Your account is set to be deleted, so new meal plans are paused.");
  expect(screen.getByRole("link", { name: "Keep my account" }).getAttribute("href")).toBe("/account/delete");
  expect((screen.getByRole("button", { name: "Continue to payment" }) as HTMLButtonElement).disabled).toBe(false);
});

it("still says a repeated request was already received for any other conflict", async () => {
  await startPlanAnswering(Response.json({ code: "SUBSCRIPTION_CONFLICT" }, { status: 409 }));

  expect((await screen.findByRole("alert")).textContent).toBe("We already received this request. Refresh the page before trying again.");
  expect(screen.queryByRole("link", { name: "Keep my account" })).toBeNull();
});

it("shows the price, what you'll receive, the next 7 days from tomorrow and only delivery-ready addresses, like the app", async () => {
  serve(Response.json({}, { status: 500 }));
  render(createElement(SubscriptionEnrollmentForm, { planId: PLAN }));
  expect(await screen.findByText("₹1,200")).toBeTruthy();
  expect(screen.getByText("/ week")).toBeTruthy();
  expect(await screen.findByText("Dal rice × 2")).toBeTruthy();
  expect(screen.getByText("Monday · Lunch · 1:00 pm")).toBeTruthy();

  const dates = screen.getAllByRole("radio").filter((input) => (input as HTMLInputElement).name === "startDate") as HTMLInputElement[];
  const tomorrow = new Date(Date.parse(`${indiaBusinessDate()}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  expect(dates).toHaveLength(7);
  expect(dates[0].value).toBe(tomorrow);
  expect(dates[0].checked).toBe(true);

  // The address without a map pin can't take a meal plan, so it isn't offered.
  const places = screen.getAllByRole("radio").filter((input) => (input as HTMLInputElement).name === "deliveryAddressId") as HTMLInputElement[];
  expect(places.map((input) => input.value)).toEqual([address.id]);
  expect(places[0].checked).toBe(true);
});

it("goes back to the payment of the same unpaid plan instead of starting a second one", async () => {
  const tomorrow = new Date(Date.parse(`${indiaBusinessDate()}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const UNPAID = "99999999-9999-4999-8999-999999999999";
  const fetchMock = serve(Response.json({}, { status: 500 }), [
    { id: UNPAID, planId: PLAN, status: "PENDING_PAYMENT", startDate: tomorrow, deliveryAddressId: address.id },
  ]);
  render(createElement(SubscriptionEnrollmentForm, { planId: PLAN }));
  const next = await screen.findByRole("button", { name: "Continue to payment" });
  await waitFor(() => expect((next as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(next);
  await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/subscriptions/${UNPAID}/payment`));
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
});

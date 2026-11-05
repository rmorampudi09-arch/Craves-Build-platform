// @vitest-environment jsdom
// Synthetic plan and address; no meal plan is created.
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/shared/lib/session-fetch", () => ({ sessionFetch: (url: string, init?: RequestInit) => fetch(url, init) }));
import { SubscriptionEnrollmentForm } from "@/features/meal-plans/components/subscription-enrollment-form";

const PLAN = "11111111-1111-4111-8111-111111111111";
const plan = { id: PLAN, name: "Weekly thali", description: null, billingPeriod: "WEEKLY", amount: 1200, currency: "INR" };
const address = { id: "66666666-6666-4666-8666-666666666666", addressLabel: "HOME", addressLine1: "Flat 302", areaName: "Banjara Hills", isDefault: true, active: true };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function startPlanAnswering(answer: Response) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/subscriptions/plans") return Response.json([plan]);
    if (url === "/api/customer/addresses") return Response.json([address]);
    if (url === "/api/subscriptions" && init?.method === "POST") return answer;
    return Response.json({}, { status: 404 });
  }));
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

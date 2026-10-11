// @vitest-environment jsdom
// Synthetic meal plan; no backend is contacted.
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SubscriptionDetails } from "@/features/meal-plans/components/subscription-details";

const ID = "11111111-1111-4111-8111-111111111111";
const PLAN = "22222222-2222-4222-8222-222222222222";
let requests: Array<{ url: string; method: string; body: unknown }> = [];

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
beforeEach(() => {
  requests = [];
  vi.stubGlobal("confirm", vi.fn());
  vi.stubGlobal("prompt", vi.fn());
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    requests.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method !== "GET") return new Response(null, { status: 204 });
    if (url.endsWith("/policy")) return Response.json({
      customerPauseEnabled: true, customerResumeEnabled: true, customerCancelEnabled: true, customerSkipEnabled: true,
      pauseCutoffMinutes: 720, resumeLeadMinutes: 1440, cancelCutoffMinutes: 1440, skipCutoffMinutes: 720,
      holidayPolicyReference: null, unusedMealPolicyReference: null, refundPolicyReference: null,
    });
    if (url.includes("/occurrences")) return Response.json([]);
    if (url.endsWith("/schedule")) return new Response(null, { status: 404 });
    return Response.json({ id: ID, planId: PLAN, status: "ACTIVE", startDate: "2026-10-05", endDate: null,
      nextServiceDate: "2026-10-12", deliveryAddressId: null, notes: null,
      createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z" });
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const changes = () => requests.filter((request) => request.method !== "GET");
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)));

describe("meal plan changes", () => {
  it("asks first, takes an optional reason, and sends the same pause request", async () => {
    render(createElement(SubscriptionDetails, { subscriptionId: ID }));
    fireEvent.click(await screen.findByRole("button", { name: "Pause" }));
    expect(screen.getByRole("dialog", { name: "Pause your meal plan?" })).toBeTruthy();
    expect(screen.getByText(/A meal due in the next 12 hours will still arrive/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Tell us why (optional)" }), { target: { value: " Travelling " } });
    fireEvent.click(screen.getByRole("button", { name: "Pause meal plan" }));

    expect(await screen.findByText("Meal plan paused.")).toBeTruthy();
    expect(changes()).toEqual([{ url: `/api/subscriptions/${ID}/pause`, method: "PATCH", body: { reason: "Travelling" } }]);
    expect(window.confirm).not.toHaveBeenCalled();
    expect(window.prompt).not.toHaveBeenCalled();
    await settle();
  });

  it("closes with no change when the customer backs out", async () => {
    render(createElement(SubscriptionDetails, { subscriptionId: ID }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep my plan" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(changes()).toEqual([]);
    await settle();
  });

  it("skips a day with the same payload and confirms it in plain words", async () => {
    render(createElement(SubscriptionDetails, { subscriptionId: ID }));
    fireEvent.click(await screen.findByRole("button", { name: "Skip a day" }));
    expect((screen.getByLabelText("Day to skip") as HTMLInputElement).value).toBe("2026-10-12");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip this day" }));

    expect(await screen.findByText("Skipped: Mon 12 Oct")).toBeTruthy();
    expect(changes()).toEqual([{ url: `/api/subscriptions/${ID}/skips`, method: "POST", body: { serviceDate: "2026-10-12", reason: null } }]);
    await settle();
  });
});

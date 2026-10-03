// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminSubscriptionPlanManager } from "../components/admin-subscription-plan-manager";
import { AdminSubscriptionOperator } from "../components/admin-subscription-operator";
import { AdminSubscriptionPolicyManager } from "../components/admin-subscription-policy-manager";
import { AdminSubscriptionScheduleManager } from "../components/admin-subscription-schedule-manager";
import { AdminSubscriptionCapacityOperator } from "../components/admin-subscription-capacity-operator";
import { AdminSubscriptionCapacityBars } from "../components/admin-subscription-capacity-bars";
import type { AdminSubscriptionPlan } from "./admin-subscription-plan-contract";
import { adminFetch } from "./admin-renewal";

vi.mock("./admin-renewal", () => ({ adminFetch: vi.fn() }));
const fetcher = vi.mocked(adminFetch);
const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const planId = "33333333-3333-4333-8333-333333333333";
const now = "2026-09-30T12:00:00Z";
const plan: AdminSubscriptionPlan = { id: planId, planCode: "WEEKLY-A", chefIdentityId: id, name: "Chef weekly meals", description: null, billingPeriod: "WEEKLY", amount: 100, currency: "INR", status: "PENDING_APPROVAL", createdAt: now, updatedAt: now };
const subscription = { id, customerIdentityId: other, planId, chefIdentityId: other, status: "ACTIVE", startDate: "2026-09-30", endDate: null, nextServiceDate: "2026-10-01", deliveryAddressId: other, createdAt: now, updatedAt: now };
const policy = { id, planId, version: 1, status: "DRAFT", customerPauseEnabled: false, customerResumeEnabled: false, customerCancelEnabled: false, customerSkipEnabled: false, pauseCutoffMinutes: null, resumeLeadMinutes: null, cancelCutoffMinutes: null, skipCutoffMinutes: null, holidayPolicyReference: null, unusedMealPolicyReference: null, refundPolicyReference: null, notes: null, createdAt: now, updatedAt: now, activatedAt: null };
const emptyPage = { items: [], nextCreatedAt: null, nextId: null, hasMore: false };
function page(items = [subscription], more = false) { return { items, nextCreatedAt: more ? now : null, nextId: more ? id : null, hasMore: more }; }
function entry(reason: string) { return { id: other, oldStatus: null, newStatus: "ACTIVE", reason, actorIdentityId: null, createdAt: now }; }
function deferred() { let resolve!: (value: Response) => void; let reject!: (reason: unknown) => void; const promise = new Promise<Response>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
beforeEach(() => { fetcher.mockReset(); vi.spyOn(window, "confirm").mockReturnValue(true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("subscription administration recovery", () => {
  it("does not present an unavailable plan queue as an empty queue, and refresh errors are handled", async () => {
    fetcher.mockRejectedValue(new Error("Network unavailable"));
    render(createElement(AdminSubscriptionPlanManager));
    await screen.findByText(/review queue could not be loaded/);
    expect(screen.queryByText("No Chef meal plans have been created yet.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
    await screen.findByRole("button", { name: "Refresh" });
  });

  it("loads the plan queue even if the optional Chef name lookup fails", async () => {
    fetcher.mockImplementation(async url => String(url).endsWith("/chefs") ? Promise.reject(new Error("Names unavailable")) : Response.json([plan]));
    render(createElement(AdminSubscriptionPlanManager));
    await screen.findByText(plan.name);
    expect(screen.getByText(/Chef names could not be loaded/)).toBeTruthy();
    expect(screen.getByText(new RegExp(`Chef: ${id}`))).toBeTruthy();
  });

  it("keeps successful review distinct from a subsequent queue refresh failure", async () => {
    let queueReads = 0;
    fetcher.mockImplementation(async (url, init) => {
      if (init?.method === "POST") return Response.json({ ...plan, status: "ACTIVE" });
      if (String(url).endsWith("/chefs")) return Response.json([]);
      return ++queueReads === 1 ? Response.json([plan]) : Response.json({}, { status: 503 });
    });
    render(createElement(AdminSubscriptionPlanManager));
    fireEvent.change(await screen.findByLabelText("Review reason"), { target: { value: "Chef plan reviewed" } });
    fireEvent.click(screen.getByRole("button", { name: "Approve plan" }));
    await screen.findByText(/Meal plan approved.*queue could not be refreshed/);
    expect((screen.getByRole("button", { name: "Approve plan" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("discards delayed audit history after switching subscriptions", async () => {
    const first = deferred(), second = deferred();
    fetcher.mockImplementation(async url => String(url).includes(`/${id}/history`) ? first.promise : String(url).includes(`/${other}/history`) ? second.promise : Response.json(page([subscription, { ...subscription, id: other }])));
    render(createElement(AdminSubscriptionOperator));
    const reviews = await screen.findAllByRole("button", { name: "Review" });
    fireEvent.click(reviews[0]); fireEvent.click(reviews[1]);
    await act(async () => second.resolve(Response.json([entry("Second subscription history")])));
    await screen.findByText("Second subscription history");
    await act(async () => first.resolve(Response.json([entry("First subscription history")])));
    expect(screen.queryByText("First subscription history")).toBeNull();
  });

  it("uses the applied filters for pagination and prevents duplicate load-more requests", async () => {
    const next = deferred();
    fetcher.mockResolvedValueOnce(Response.json(page([subscription], true))).mockReturnValue(next.promise);
    render(createElement(AdminSubscriptionOperator));
    const more = await screen.findByRole("button", { name: "Load more" });
    fireEvent.change(screen.getByLabelText("Plan UUID filter"), { target: { value: other } });
    fireEvent.click(more); fireEvent.click(more);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    const requested = new URL(String(fetcher.mock.calls[1][0]), "https://craves.invalid");
    expect(requested.searchParams.has("planId")).toBe(false);
    expect(requested.searchParams.get("afterId")).toBe(id);
    await act(async () => next.resolve(Response.json(emptyPage)));
  });

  it("shows a confirmed status update when audit history refresh fails", async () => {
    let histories = 0;
    fetcher.mockImplementation(async (url, init) => {
      if (init?.method === "PATCH") return Response.json({ ...subscription, status: "PAUSED", updatedAt: "2026-09-30T12:05:00Z" });
      if (String(url).includes("/history")) return ++histories === 1 ? Response.json([]) : Response.json({}, { status: 503 });
      return Response.json(page());
    });
    render(createElement(AdminSubscriptionOperator));
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    await screen.findByText("No status history was returned.");
    fireEvent.change(screen.getByLabelText("New status"), { target: { value: "PAUSED" } });
    fireEvent.change(screen.getByLabelText("Required operational reason"), { target: { value: "Customer requested hold" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply status" }));
    await screen.findByText(/Subscription status updated and audited.*could not be refreshed/);
    expect(screen.getByRole("button", { name: "Retry history" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "PAUSED" })).toBeTruthy();
    expect(screen.queryByText("Subscription status update failed.")).toBeNull();
  });

  it("explains that a renewed session requires the operator to retry the action", async () => {
    fetcher.mockImplementation(async (url, init) => init?.method === "PATCH" ? Response.json({ code: "SESSION_RENEWED_RETRY_REQUIRED" }, { status: 409 }) : String(url).includes("/history") ? Response.json([]) : Response.json(page()));
    render(createElement(AdminSubscriptionOperator));
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    await screen.findByText("No status history was returned.");
    fireEvent.change(screen.getByLabelText("New status"), { target: { value: "PAUSED" } });
    fireEvent.change(screen.getByLabelText("Required operational reason"), { target: { value: "Customer requested hold" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply status" }));
    await screen.findByText(/session was renewed.*click Apply status again/);
    expect(screen.getByRole("cell", { name: "ACTIVE" })).toBeTruthy();
    expect((screen.getByLabelText("Required operational reason") as HTMLInputElement).value).toBe("Customer requested hold");
  });

  it("requires a successful policy load and saved form before activation", async () => {
    fetcher.mockResolvedValueOnce(Response.json({}, { status: 503 })).mockResolvedValue(Response.json(policy));
    render(createElement(AdminSubscriptionPolicyManager, { plan, onChanged: async () => undefined }));
    await screen.findByText(/Lifecycle policy is unavailable/);
    expect((screen.getByRole("button", { name: "Save policy draft" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/No policy configured/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reload policy" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Save policy draft" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText("Policy activation reason"), { target: { value: "Reviewed by admin" } });
    expect((screen.getByRole("button", { name: "Activate policy" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("Administrator policy notes"), { target: { value: "Unsaved policy edit" } });
    expect((screen.getByRole("button", { name: "Activate policy" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Save your changes before activating the draft.")).toBeTruthy();
  });

  it("makes policy controls reachable from expanded plan controls and refreshes plans after save", async () => {
    let queueReads = 0;
    fetcher.mockImplementation(async (url, init) => {
      const path = String(url);
      if (path.endsWith("/subscription-plans")) { queueReads++; return Response.json([plan]); }
      if (path.endsWith("/subscription-plans/chefs")) return Response.json([]);
      if (path.endsWith(`/${planId}/policy`)) return Response.json({ ...policy, notes: init?.method === "PUT" ? "Approved lifecycle reference" : null });
      return Response.json({}, { status: 404 });
    });
    render(createElement(AdminSubscriptionPlanManager));
    const details = await screen.findByRole("button", { name: "Review plan, capacity & policy" });
    expect(details.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "Save policy draft" })).toBeNull();
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/policy"))).toBe(false);
    fireEvent.click(details);
    const save = await screen.findByRole("button", { name: "Save policy draft" });
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    expect(details.getAttribute("aria-expanded")).toBe("true");
    const panelId = details.getAttribute("aria-controls");
    expect(panelId && document.getElementById(panelId)?.contains(save)).toBe(true);
    expect(screen.getByLabelText("Policy activation reason")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Administrator policy notes"), { target: { value: "Approved lifecycle reference" } });
    fireEvent.click(save);
    await screen.findByText("Policy draft saved.");
    expect(queueReads).toBe(2);
    expect((screen.getByLabelText("Administrator policy notes") as HTMLTextAreaElement).value).toBe("Approved lifecycle reference");
    fireEvent.click(screen.getByRole("button", { name: "Hide plan controls" }));
    expect(screen.queryByRole("button", { name: "Save policy draft" })).toBeNull();
  });

  it("does not report policy save failure when only the plan overview refresh fails", async () => {
    fetcher.mockImplementation(async () => Response.json(policy));
    render(createElement(AdminSubscriptionPolicyManager, { plan, onChanged: async () => { throw new Error("Overview unavailable"); } }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Save policy draft" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Save policy draft" }));
    await screen.findByText(/Policy draft saved.*overview could not be refreshed/);
    expect(screen.queryByText("Policy draft could not be saved.")).toBeNull();
  });

  it("does not treat unavailable capacity incidents as no open incidents", async () => {
    fetcher.mockRejectedValue(new Error("Network unavailable"));
    render(createElement(AdminSubscriptionCapacityOperator));
    await screen.findByText("Network unavailable");
    expect(screen.queryByText("No open capacity incidents match the current filter.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Refresh incidents" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    await screen.findByRole("button", { name: "Refresh incidents" });
  });

  it("refreshes the loaded chef after reconciliation and preserves success if refresh fails", async () => {
    const capacity = { chefIdentityId: id, adminSalesFrozen: false, freezeReason: null, slotRules: [], menuItemRules: [], dateOverrides: [], menuItemDateOverrides: [], openIncidentCount: 0 };
    let summaryReads = 0;
    fetcher.mockImplementation(async (url, init) => {
      if (init?.method === "POST") return Response.json({ reconciled: true });
      if (String(url).includes("/chefs/")) return ++summaryReads === 1 ? Response.json(capacity) : Response.json({}, { status: 503 });
      return Response.json(emptyPage);
    });
    render(createElement(AdminSubscriptionCapacityOperator));
    await screen.findByText("No open capacity incidents match the current filter.");
    fireEvent.change(screen.getByLabelText("Chef identity UUID"), { target: { value: id } });
    fireEvent.click(screen.getByRole("button", { name: "Load chef capacity" }));
    await screen.findByText(/Loaded chef:/);
    await screen.findByRole("button", { name: "Load chef capacity" });
    fireEvent.change(screen.getByLabelText("Chef identity UUID"), { target: { value: other } });
    fireEvent.change(screen.getByLabelText("Subscription UUID for reconciliation"), { target: { value: planId } });
    fireEvent.change(screen.getByLabelText("Reconciliation reason"), { target: { value: "Incident reservation reviewed" } });
    fireEvent.click(screen.getByRole("button", { name: "Reconcile" }));
    await screen.findByText(/reconciliation completed and audited.*could not be refreshed/i);
    const summaryCalls = fetcher.mock.calls.filter(([url]) => String(url).includes("/chefs/"));
    expect(summaryCalls).toHaveLength(2);
    expect(summaryCalls.every(([url]) => String(url).endsWith(`/chefs/${id}`))).toBe(true);
    expect(screen.queryByRole("button", { name: "Freeze new sales" })).toBeNull();
  });

  it("retries an unavailable comparison and clears a stale ready decision on failed refresh", async () => {
    const capacity = { chefIdentityId: id, adminSalesFrozen: false, freezeReason: null, slotRules: [], menuItemRules: [], dateOverrides: [], menuItemDateOverrides: [], openIncidentCount: 0 };
    const schedule = { planId, recurrenceType: "WEEKLY", timezone: "Asia/Kolkata", serviceTime: "12:00", generationLeadHours: 24, status: "DRAFT", version: 1, createdAt: now, updatedAt: now, activatedAt: null, items: [{ id, menuItemId: other, quantity: 1, isoDayOfWeek: 1, dayOfMonth: null, mealSlotCode: "LUNCH", serviceTime: "12:00", sequenceNumber: 1 }] };
    let available = false;
    fetcher.mockImplementation(async url => {
      if (!available) throw new Error("Network unavailable");
      return Response.json(String(url).endsWith("/schedule") ? schedule : capacity);
    });
    render(createElement(AdminSubscriptionCapacityBars, { plan }));
    await screen.findByText("Capacity check unavailable");
    expect(screen.queryByText("Ready to approve")).toBeNull();
    available = true;
    fireEvent.click(screen.getByRole("button", { name: "Refresh capacity comparison" }));
    await screen.findByText("Ready to approve");
    available = false;
    fireEvent.click(screen.getByRole("button", { name: "Refresh capacity comparison" }));
    await screen.findByText("Capacity check unavailable");
    expect(screen.queryByText("Ready to approve")).toBeNull();
    expect(screen.getByRole("button", { name: "Refresh capacity comparison" })).toBeTruthy();
  });

  it("discards a schedule response from the previous plan", async () => {
    const first = deferred();
    const schedule = { planId, recurrenceType: "WEEKLY", timezone: "Asia/Kolkata", serviceTime: "12:00", generationLeadHours: 24, status: "DRAFT", version: 1, createdAt: now, updatedAt: now, activatedAt: null, items: [{ id, menuItemId: other, quantity: 1, isoDayOfWeek: 1, dayOfMonth: null, mealSlotCode: "LUNCH", serviceTime: "12:00", sequenceNumber: 1, menuItemName: "Previous plan dish" }] };
    fetcher.mockReturnValueOnce(first.promise).mockResolvedValue(Response.json({ ...schedule, planId: other, items: [{ ...schedule.items[0], menuItemName: "Current plan dish" }] }));
    const view = render(createElement(AdminSubscriptionScheduleManager, { plan }));
    view.rerender(createElement(AdminSubscriptionScheduleManager, { plan: { ...plan, id: other } }));
    await screen.findByText("Current plan dish");
    await act(async () => first.resolve(Response.json(schedule)));
    expect(screen.queryByText("Previous plan dish")).toBeNull();
  });
});

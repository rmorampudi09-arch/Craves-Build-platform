// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BankAutomationAdminPanel } from "../components/bank-automation-admin-panel";
import { FinanceWorkspace } from "../components/finance-workspace";
import { ManualChefSettlementPanel } from "../components/manual-chef-settlement-panel";

const chef = "00112233-4455-4677-8899-aabbccddeeff";
const instruction = "10112233-4455-4677-8899-aabbccddeeff";
const bank = {revision: 2, submissionsEnabled: false, validationEnabled: false, maximumRequestsPerDay: 3, encryptionReady: true, providerReady: false, workerDeployed: true, recent: []};
const settings = {ledgerStartDate: "2026-09-14", ledgerEnabled: false, automaticPayoutsEnabled: false, manualWithdrawalsEnabled: false, automaticPayoutDelayHours: 48, manualAvailabilityDelayHours: 0, customerCancellationSeconds: 60, chefFeePercent: "7", restaurantGstPercent: "5", deliveryGstPercent: "18", platformGstPercent: "18", chefFeeGstPercent: "18", chefFeeTaxTreatment: "INCLUSIVE", platformFee: "0.00", subscriptionQuotesEnabled: false, taxApprovalReference: null};
const view = {settings, revision: 2, policyId: null, activationBlockers: [], releaseStatus: "NOT_ACTIVATED", maximumManualRequestsPerIstDay: 1};
const row = {id: instruction, chefIdentityId: chef, amount: "338.52", status: "SUBMITTING", version: 1, destinationReference: "secure-destination", bankReference: null, authorizedAt: "2026-09-30T09:00:00Z", paidAt: null, createdAt: "2026-09-30T08:00:00Z"};
const balance = {chefIdentityId: chef, available: "338.52", onHold: false, enabled: true, manualRequestUsedToday: false, recent: []};
afterEach(() => {cleanup();vi.unstubAllGlobals();});

describe("finance tasks and payment feedback", () => {
  it("opens the payment task, supports keyboard tabs and keeps provider activation unavailable", async () => {
    const fetcher = vi.fn<(...args: [string, RequestInit?]) => Promise<Response>>(async (url: string) => Response.json(url.endsWith("/settings") ? view : url.endsWith("/bank-onboarding") ? bank : url.endsWith("/chefs") ? [{identityId: chef, displayName: "Approved chef"}] : []));
    vi.stubGlobal("fetch", fetcher);
    render(createElement(FinanceWorkspace));
    await screen.findByText("RazorpayX disabled · vendor approval pending");
    expect(screen.getByRole("tab", {name: "Chef payments"}).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", {name: "Pay a chef manually"})).toBeTruthy();
    expect(screen.queryByRole("heading", {name: "Policy and rates"})).toBeNull();
    fireEvent.keyDown(screen.getByRole("tab", {name: "Chef payments"}), {key: "ArrowRight"});
    expect(screen.getByRole("tab", {name: "Policy & rates"}).getAttribute("aria-selected")).toBe("true");
    expect((await screen.findByRole("checkbox", {name: "Automatic payout queue"}) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("tab", {name: "Bank & RazorpayX"}));
    expect(screen.getByText(/Bank automation settings are read-only/)).toBeTruthy();
    expect(screen.queryByRole("button", {name: "Save automation settings"})).toBeNull();
    expect(fetcher.mock.calls.every(call => !call[1] || (call[1] as RequestInit).method !== "POST")).toBe(true);
  });
  it("bank status can be refreshed without writing provider configuration", async () => {
    const fetcher = vi.fn<(...args: [string, RequestInit?]) => Promise<Response>>(async () => Response.json(bank));vi.stubGlobal("fetch", fetcher);
    render(createElement(BankAutomationAdminPanel));await screen.findByText("3 per rolling 24 hours");
    fireEvent.click(screen.getByRole("button", {name: "Refresh bank status"}));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(fetcher.mock.calls.every(call => (call[1] as RequestInit | undefined)?.method !== "POST")).toBe(true);
  });
  it("loads a selected chef automatically and explains runtime blockers before a new reservation", async () => {
    const fetcher = vi.fn(async (url: string) => Response.json(url.endsWith("/chefs") ? [{identityId: chef, displayName: "Approved chef"}] : {...balance, enabled: false, blockers: ["JOURNAL_POSTING_DISABLED"]}));
    vi.stubGlobal("fetch", fetcher);render(createElement(ManualChefSettlementPanel));await screen.findByRole("option", {name: "Approved chef"});
    fireEvent.change(screen.getByLabelText("Approved chef"), {target: {value: chef}});
    await screen.findByText(/The earnings journal is paused/);
    fireEvent.change(screen.getByLabelText("Operator reason"), {target: {value: "Reviewed chef payment"}});
    expect((screen.getByRole("button", {name: "Reserve ₹338.52 for this chef"}) as HTMLButtonElement).disabled).toBe(true);
    expect(fetcher.mock.calls.some(call => call[0].endsWith(`/${chef}/manual-settlement`))).toBe(true);
  });
  it("never claims a confirmed payment when the journal leaves its original state held for review", async () => {
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => Response.json(url.endsWith("/chefs") ? [{identityId: chef, displayName: "Approved chef"}] : options?.method === "POST" ? row : {...balance, recent: [row]}));
    vi.stubGlobal("fetch", fetcher);render(createElement(ManualChefSettlementPanel));await screen.findByRole("option", {name: "Approved chef"});
    fireEvent.change(screen.getByLabelText("Approved chef"), {target: {value: chef}});
    fireEvent.click(await screen.findByRole("button", {name: instruction}));
    fireEvent.change(screen.getByLabelText("Operator reason"), {target: {value: "Verified original transfer"}});
    fireEvent.change(screen.getByLabelText("Bank outcome evidence reference"), {target: {value: "secure-bank-record"}});
    fireEvent.change(screen.getByLabelText("Actual bank time (India)"), {target: {value: "2026-09-30T14:30:00"}});
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", {name: "Record confirmed bank payment"}));
    await screen.findByText(/Payment remains held for accounting review/);
    expect(screen.queryByText(/Settlement recorded as PAID/)).toBeNull();
    const posted = fetcher.mock.calls.find(call => call[1]?.method === "POST");
    expect(JSON.parse(String(posted?.[1]?.body)).paidAt).toBe("2026-09-30T14:30:00+05:30");
  });
});

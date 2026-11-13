// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinanceControlCenter } from "../components/finance-control-center";

const settings = {ledgerStartDate: "2026-09-14", ledgerEnabled: false, automaticPayoutsEnabled: false, manualWithdrawalsEnabled: false,
  automaticPayoutDelayHours: 48, manualAvailabilityDelayHours: 0, customerCancellationSeconds: 60, chefFeePercent: "7",
  restaurantGstPercent: "5", deliveryGstPercent: "18", platformGstPercent: "18", chefFeeGstPercent: "18", chefFeeTaxTreatment: "INCLUSIVE",
  platformFee: "0.00", subscriptionQuotesEnabled: false, taxApprovalReference: null};
const view = {settings, revision: 0, policyId: null, activationBlockers: ["AUTHORITATIVE_ORDER_SNAPSHOT_AND_CAPTURE_WIRING_NOT_CERTIFIED"], releaseStatus: "NOT_ACTIVATED", maximumManualRequestsPerIstDay: 1};
afterEach(() => {cleanup();vi.unstubAllGlobals();});
describe("admin finance interactions", () => {
  it("says in plain words what is in use and what is not ready, and asks for nothing but the settings", async () => {
    const fetcher=vi.fn(async (url: string) => url.endsWith("/settings") ? Response.json(view) : Response.json({}, {status: 503}));vi.stubGlobal("fetch", fetcher);
    render(createElement(FinanceControlCenter));
    expect(await screen.findByLabelText("Chef service fee, percent")).toBeTruthy();
    expect(screen.getByText(/Recording of order money and chef earnings is switched off/)).toBeTruthy();
    expect(screen.getByText(/Order money is not yet recorded from confirmed payments/)).toBeTruthy();
    expect(screen.getByText(/Chefs are charged 7% in all, with GST inside it/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/NOT_ACTIVATED|NOT CERTIFIED|immutable/i);
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(["/api/admin/finance/settings"]);
  });
  it("shows a failed load as a failure with a way to retry, never as empty settings", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({}, {status: 503})));
    render(createElement(FinanceControlCenter));
    expect(await screen.findByRole("button", {name: "Load the settings again"})).toBeTruthy();
    expect(screen.queryByLabelText("Chef service fee, percent")).toBeNull();
  });
  it("does not invent tariff values and refuses to save an incomplete tariff", async () => {
    const fetcher=vi.fn(async (url: string) => Response.json(url.endsWith("/settings") ? view : []));vi.stubGlobal("fetch", fetcher);
    render(createElement(FinanceControlCenter));await screen.findByLabelText("Chef service fee, percent");
    fireEvent.click(screen.getByLabelText("Set a delivery price by distance"));
    expect((screen.getByLabelText("Starting delivery charge, in rupees") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("Why this change is being made, and who approved it"), {target: {value: "Test owner choice"}});
    fireEvent.click(screen.getByRole("button", {name: "Save as a draft"}));
    await screen.findByText(/Fill in every rate/);expect(fetcher.mock.calls.some(call=>call[0].endsWith("/policies"))).toBe(false);
  });
  it("blocks activation when the backend silently changes reviewed fee treatment", async () => {
    const fetcher=vi.fn(async (url: string) => {
      if(url.endsWith("/settings"))return Response.json(view);
      if(url.endsWith("/policies"))return Response.json({id:"00112233-4455-4677-8899-aabbccddeeff",contentHash:"a".repeat(64),settings:{...settings,chefFeeTaxTreatment:"EXCLUSIVE"}});
      return Response.json([]);
    });vi.stubGlobal("fetch", fetcher);render(createElement(FinanceControlCenter));await screen.findByLabelText("Chef service fee, percent");
    fireEvent.change(screen.getByLabelText("Why this change is being made, and who approved it"), {target: {value: "Test inclusive choice"}});
    fireEvent.click(screen.getByRole("button", {name: "Save as a draft"}));await screen.findByText(/does not match what you entered/);
    await waitFor(()=>expect((screen.getByRole("button", {name: "Switch these settings on"}) as HTMLButtonElement).disabled).toBe(true));
  });
});

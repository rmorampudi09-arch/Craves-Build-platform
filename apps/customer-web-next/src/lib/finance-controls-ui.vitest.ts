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
  it("keeps settings editable when payouts fail, without presenting the failure as no payouts", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/settings") ? Response.json(view) : Response.json({}, {status: 503})));
    render(createElement(FinanceControlCenter));
    await screen.findByText(/Payout instructions could not be loaded/);
    expect(screen.getByLabelText("Chef service fee, percent")).toBeTruthy();
    expect(screen.queryByText("No new-engine payout instructions returned.")).toBeNull();
    expect(screen.getByText(/total chef service-fee deduction is 7%/)).toBeTruthy();
  });
  it("does not invent tariff values and refuses to save an incomplete tariff", async () => {
    const fetcher=vi.fn(async (url: string) => Response.json(url.endsWith("/settings") ? view : []));vi.stubGlobal("fetch", fetcher);
    render(createElement(FinanceControlCenter));await screen.findByLabelText("Chef service fee, percent");
    fireEvent.click(screen.getByLabelText("Configure a distance tariff for this policy"));
    expect((screen.getByLabelText("Base delivery charge, INR") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("Reason and approval evidence"), {target: {value: "Test owner choice"}});
    fireEvent.click(screen.getByRole("button", {name: "Save immutable draft"}));
    await screen.findByText(/Complete all rates/);expect(fetcher.mock.calls.some(call=>call[0].endsWith("/policies"))).toBe(false);
  });
  it("blocks activation when the backend silently changes reviewed fee treatment", async () => {
    const fetcher=vi.fn(async (url: string) => {
      if(url.endsWith("/settings"))return Response.json(view);
      if(url.endsWith("/policies"))return Response.json({id:"00112233-4455-4677-8899-aabbccddeeff",contentHash:"a".repeat(64),settings:{...settings,chefFeeTaxTreatment:"EXCLUSIVE"}});
      return Response.json([]);
    });vi.stubGlobal("fetch", fetcher);render(createElement(FinanceControlCenter));await screen.findByLabelText("Chef service fee, percent");
    fireEvent.change(screen.getByLabelText("Reason and approval evidence"), {target: {value: "Test inclusive choice"}});
    fireEvent.click(screen.getByRole("button", {name: "Save immutable draft"}));await screen.findByText(/saved policy differs/);
    await waitFor(()=>expect((screen.getByRole("button", {name: "Activate reviewed version"}) as HTMLButtonElement).disabled).toBe(true));
  });
});

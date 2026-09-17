import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { chefAccountingSchema, chefBalanceSchema } from "./finance-contract";
import { manualBalanceSchema } from "./manual-settlement-contract";
import { ChefAccountingBreakdown } from "../components/chef-accounting-breakdown";

const accounting = {recordedOrders: 1, grossFood: "1000.00", totalServiceFee: "70.00", feeBeforeGst: "59.32",
  feeGst: "10.68", withholding: "0.00", originalNetEarnings: "930.00", recordedPayments: "0.00",
  outstanding: "930.00", otherLedgerMovements: "0.00", legacyRecords: 0};
describe("shared chef accounting breakdown", () => {
  it("preserves exact amounts without recomputing the fee", () => expect(chefAccountingSchema.parse(accounting)).toEqual(accounting));
  it.each([70,"70.001","7e1",null])("rejects ambiguous fee %s", value => expect(chefAccountingSchema.safeParse({...accounting,totalServiceFee: value}).success).toBe(false));
  it("accepts signed actual adjustments and outstanding", () => expect(chefAccountingSchema.parse({...accounting,outstanding:"-10.00",otherLedgerMovements:"-940.00"}).outstanding).toBe("-10.00"));
  it("strips unapproved fields", () => expect(chefAccountingSchema.parse({...accounting,bankAccount:"PRIVATE"})).toEqual(accounting));
  it.each([{totalServiceFee:"70.01"},{grossFood:"1000.01"},{outstanding:"930.01"}])("rejects a one-paisa reconciliation mismatch %s", change => expect(chefAccountingSchema.safeParse({...accounting,...change}).success).toBe(false));
  it("passes the same accounting through admin and chef contracts", () => {
    expect(manualBalanceSchema.parse({chefIdentityId:"00112233-4455-4677-8899-aabbccddeeff",available:"0.00",onHold:true,enabled:true,manualRequestUsedToday:false,recent:[],accounting}).accounting).toEqual(accounting);
    expect(chefBalanceSchema.parse({available:"0.00",outstanding:"930.00",reservedOrPaid:"0.00",onHold:true,manualRequestUsedToday:false,nextManualRequestAt:"2026-09-18T00:00:00Z",recentPayouts:[],executionEnabled:false,payoutMode:"CRAVES_MANUAL",accounting}).accounting).toEqual(accounting);
  });
  it("does not imply fee GST is charged again or outstanding is withdrawable", () => {
    const html=renderToStaticMarkup(createElement(ChefAccountingBreakdown,{accounting}));
    expect(html).toContain("not an extra deduction");expect(html).toContain("Customer food GST is separate");
    expect(html).toContain("not necessarily available to withdraw");expect(html).toContain("all recorded history");
  });
  it("does not turn an absent breakdown into zero", () => {
    const html=renderToStaticMarkup(createElement(ChefAccountingBreakdown,{accounting:undefined}));
    expect(html).toContain("unavailable");expect(html).not.toContain("₹0");
  });
  it("clearly excludes legacy records from new balances", () => {
    expect(renderToStaticMarkup(createElement(ChefAccountingBreakdown,{accounting:{...accounting,legacyRecords:2}}))).toContain("not automatically added");
  });
});

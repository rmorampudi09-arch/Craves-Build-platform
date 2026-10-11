import { describe, expect, it } from "vitest";
import { deliveryTariffSchema, financeSettingsSchema, financeRoute } from "./finance-contract";
import { reviewedPolicyMatches } from "./finance-policy-review";

const tariff = {baseCharge: "20.00", includedKm: "2", perKmCharge: "10.00", maximumKm: "10", distanceBasis: "STRAIGHT_LINE", increment: "PRO_RATA"};
const settings = financeSettingsSchema.parse({ledgerStartDate: "2026-09-14", ledgerEnabled: false, automaticPayoutsEnabled: false,
  manualWithdrawalsEnabled: false, automaticPayoutDelayHours: 48, manualAvailabilityDelayHours: 0, customerCancellationSeconds: 60,
  chefFeePercent: "7", restaurantGstPercent: "5", deliveryGstPercent: "18", platformGstPercent: "18", chefFeeGstPercent: "18",
  chefFeeTaxTreatment: "INCLUSIVE", platformFee: "0.00", subscriptionQuotesEnabled: false, taxApprovalReference: null});
describe("admin delivery tariff and reviewed policy", () => {
  it("accepts explicit test-only tariff choices", () => expect(deliveryTariffSchema.safeParse(tariff).success).toBe(true));
  it.each([{baseCharge: ""}, {baseCharge: "1.001"}, {includedKm: "11"}, {maximumKm: "0"}, {perKmCharge: "-1.00"},
    {distanceBasis: "UNCONFIRMED"}, {increment: "UNCONFIRMED"}, {maximumKm: "1e2"}, {includedKm: "1.0001"}])("rejects incomplete or invalid pricing %j", change => {
    expect(deliveryTariffSchema.safeParse({...tariff, ...change}).success).toBe(false);
  });
  it("reads older policies without inventing a distance tariff", () => expect(settings.deliveryTariff).toBeUndefined());
  it("keeps null and omitted tariff equivalent without a fee change", () => {
    expect(reviewedPolicyMatches({...settings, chefFeePercent: "7.00", deliveryTariff: null}, settings)).toBe(true);
  });
  it("blocks ignored tariff settings or changed inclusive treatment", () => {
    const changed = {...settings, deliveryTariff: deliveryTariffSchema.parse(tariff)};
    expect(reviewedPolicyMatches(changed, settings)).toBe(false);
    expect(reviewedPolicyMatches(settings, {...settings, chefFeeTaxTreatment: "EXCLUSIVE"})).toBe(false);
    expect(reviewedPolicyMatches(changed, {...changed, deliveryTariff: {...changed.deliveryTariff, includedKm: "2.000"}})).toBe(true);
  });
  it("exposes the calculator to admin POST only", () => {
    expect(financeRoute("admin", "POST", ["delivery-preview"])).toBe("/admin/finance/delivery-preview");
    expect(financeRoute("chef", "POST", ["delivery-preview"])).toBeNull();
    expect(financeRoute("admin", "GET", ["delivery-preview"])).toBeNull();
  });
});

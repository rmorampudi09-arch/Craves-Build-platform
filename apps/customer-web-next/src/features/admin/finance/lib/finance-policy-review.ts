import { financeSettingsSchema, type FinanceSettings } from "./finance-contract";

/** Compare reviewed values semantically after server decimal normalization, not response key order. */
export function reviewedPolicyMatches(expected: FinanceSettings, actual: FinanceSettings): boolean {
  function normalized(value: FinanceSettings) {
    const result = financeSettingsSchema.parse(value);
    for (const key of ["chefFeePercent", "restaurantGstPercent", "deliveryGstPercent", "platformGstPercent", "chefFeeGstPercent"] as const)
      result[key] = String(Number(result[key]));
    const money = (amount: string) => `${BigInt(amount.split(".")[0])}.${amount.split(".")[1]}`;
    result.platformFee = money(result.platformFee);
    result.taxApprovalReference = result.taxApprovalReference?.trim() || null;
    result.deliveryTariff = result.deliveryTariff ? {...result.deliveryTariff,
      baseCharge: money(result.deliveryTariff.baseCharge), perKmCharge: money(result.deliveryTariff.perKmCharge),
      includedKm: String(Number(result.deliveryTariff.includedKm)), maximumKm: String(Number(result.deliveryTariff.maximumKm)),
    } : null;
    return JSON.stringify(result);
  }
  return normalized(expected) === normalized(actual);
}

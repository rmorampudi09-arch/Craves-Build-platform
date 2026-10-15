// Pure schedule helpers, ported from the app's mealPlans/domain/mealPlanSchedule.ts.

export type BillingUnit = "week" | "14 days" | "28 days";

export function billingUnit(period: string): BillingUnit {
  switch (period.toUpperCase()) {
    case "MONTHLY": return "28 days";
    case "FORTNIGHTLY": return "14 days";
    default: return "week";
  }
}

export function billingPeriodLabel(period: string): "Weekly" | "14 days" | "Monthly" {
  const unit = billingUnit(period);
  return unit === "week" ? "Weekly" : unit === "14 days" ? "14 days" : "Monthly";
}

/** Every bill is whole repeats of the chef's week. */
export function weeksPerBill(unit: BillingUnit): 1 | 2 | 4 {
  return unit === "week" ? 1 : unit === "14 days" ? 2 : 4;
}

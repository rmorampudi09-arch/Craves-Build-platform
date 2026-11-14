"use client";

import { BankAutomationAdminPanel } from "@/features/admin/finance/components/bank-automation-admin-panel";
import { FinanceControlCenter } from "@/features/admin/finance/components/finance-control-center";
import { FinanceReconciliationPanel } from "@/features/admin/finance/components/finance-reconciliation-panel";
import type { ReactNode } from "react";

/** The controls the old Finance page was made of, doing what they did, in plainer words. `taxProfiles` is the chef feature's panel, handed in by the page. */
export function FinanceSettings({ taxProfiles }: { taxProfiles: ReactNode }) {
  return <div className="fn-settings">
    <p className="fn-note">These settings decide how fees, taxes and payouts are worked out. They are rarely changed; every change asks for a reason and is kept on record.</p>
    <FinanceControlCenter />
    <BankAutomationAdminPanel />
    {taxProfiles}
    <FinanceReconciliationPanel />
  </div>;
}

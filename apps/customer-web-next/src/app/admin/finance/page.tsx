import { FinanceControlCenter } from "@/features/admin/finance/components/finance-control-center";
import { FinanceReconciliationPanel } from "@/features/admin/finance/components/finance-reconciliation-panel";
import { ChefTaxProfilePanel } from "@/features/chef/components/chef-tax-profile-panel";
import { BankAutomationAdminPanel } from "@/features/admin/finance/components/bank-automation-admin-panel";
import { ManualChefSettlementPanel } from "@/features/admin/finance/components/manual-chef-settlement-panel";
export default function FinancePage() {
  return <><BankAutomationAdminPanel /><FinanceControlCenter /><ManualChefSettlementPanel /><ChefTaxProfilePanel /><FinanceReconciliationPanel /></>;
}

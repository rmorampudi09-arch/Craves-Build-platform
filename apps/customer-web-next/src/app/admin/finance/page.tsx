import { FinanceControlCenter } from "@/components/finance-control-center";
import { FinanceReconciliationPanel } from "@/components/finance-reconciliation-panel";
import { ChefTaxProfilePanel } from "@/components/chef-tax-profile-panel";
import { BankAutomationAdminPanel } from "@/components/bank-automation-admin-panel";
export default function FinancePage() {
  return <><BankAutomationAdminPanel /><FinanceControlCenter /><ChefTaxProfilePanel /><FinanceReconciliationPanel /></>;
}

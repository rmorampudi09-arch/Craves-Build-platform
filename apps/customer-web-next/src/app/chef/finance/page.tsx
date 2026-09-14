import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefPageHeader } from "@/components/chef-page-header";
import { ChefWithdrawalPanel } from "@/components/chef-withdrawal-panel";
import { ChefLedgerStatementPanel } from "@/components/chef-ledger-statement-panel";
import { ChefBankOnboardingPanel } from "@/components/chef-bank-onboarding-panel";
export const metadata = {title: "Chef balance and withdrawals | Craves", robots: {index: false, follow: false}};
export default function ChefFinancePage() {
  return <main className="mx-auto min-h-screen max-w-7xl px-4 py-6">
    <ChefPageHeader eyebrow="Chef finance" title="Balance and withdrawal requests"
      description="Manage your provider-validated bank account, verified available earnings and transfer status. Historical earnings are not silently imported as new withdrawable funds." />
    <div className="mt-6 space-y-6"><ChefAccessBoundary><ChefBankOnboardingPanel /><ChefWithdrawalPanel /><ChefLedgerStatementPanel /></ChefAccessBoundary></div>
  </main>;
}

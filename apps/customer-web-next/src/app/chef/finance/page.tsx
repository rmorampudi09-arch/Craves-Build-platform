import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefPageHeader } from "@/components/chef-page-header";
import { ChefWithdrawalPanel } from "@/components/chef-withdrawal-panel";
import { ChefLedgerStatementPanel } from "@/components/chef-ledger-statement-panel";
import { ChefBankOnboardingPanel } from "@/components/chef-bank-onboarding-panel";
import { EmailVerificationPanel } from "@/components/auth/EmailVerificationPanel";
export const metadata = {title: "Chef balance and withdrawals | Craves", robots: {index: false, follow: false}};
export default function ChefFinancePage() {
  return <main className="mx-auto min-h-screen max-w-7xl px-4 py-6">
    <ChefPageHeader eyebrow="Chef finance" title="Balance and withdrawal requests"
      description="View earned balances, manual Craves payment requests and statements. Historical earnings retain their original accounting." />
    <div className="mt-6 space-y-6"><ChefAccessBoundary><EmailVerificationPanel required /><ChefBankOnboardingPanel /><ChefWithdrawalPanel /><ChefLedgerStatementPanel /></ChefAccessBoundary></div>
  </main>;
}

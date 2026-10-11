import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefPageHeader } from "@/features/chef/components/chef-page-header";
import { ChefWithdrawalPanel } from "@/features/chef/components/chef-withdrawal-panel";
import { ChefLedgerStatementPanel } from "@/features/chef/components/chef-ledger-statement-panel";
import { ChefBankOnboardingPanel } from "@/features/chef/components/chef-bank-onboarding-panel";
import { EmailVerificationPanel } from "@/features/sign-in/components/EmailVerificationPanel";
export const metadata = {title: "Chef balance and withdrawals | Craves", robots: {index: false, follow: false}};
export default function ChefFinancePage() {
  return <main className="mx-auto min-h-screen max-w-7xl px-4 py-6">
    <ChefPageHeader eyebrow="Chef finance" title="Balance and withdrawal requests"
      description="View earned balances, manual Craves payment requests and statements. Historical earnings retain their original accounting." />
    <div className="mt-6 space-y-6"><ChefAccessBoundary><EmailVerificationPanel required /><ChefBankOnboardingPanel /><ChefWithdrawalPanel /><ChefLedgerStatementPanel /></ChefAccessBoundary></div>
  </main>;
}

import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefPageHeader } from "@/components/chef-page-header";
import { ChefWithdrawalPanel } from "@/components/chef-withdrawal-panel";
import { ChefLedgerStatementPanel } from "@/components/chef-ledger-statement-panel";
import { ChefBankOnboardingPanel } from "@/components/chef-bank-onboarding-panel";
import { EmailVerificationPanel } from "@/components/auth/EmailVerificationPanel";
export const metadata = {title: "Balance and payouts | Craves Chef", robots: {index: false, follow: false}};
export default function ChefFinancePage() {
  return <main className="chef-page is-narrow">
    <ChefAccessBoundary>
      <ChefPageHeader title="Balance & payouts" description="What you can withdraw, where it’s paid and your payout history." back={{href: "/chef/earnings", label: "Earnings"}} />
      <div className="chef-stack"><ChefWithdrawalPanel /><ChefBankOnboardingPanel /><EmailVerificationPanel required /><ChefLedgerStatementPanel /></div>
    </ChefAccessBoundary>
  </main>;
}

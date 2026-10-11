import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefPageHeader } from "@/features/chef/components/chef-page-header";
import { ChefWithdrawalPanel } from "@/features/chef/components/chef-withdrawal-panel";
import { ChefLedgerStatementPanel } from "@/features/chef/components/chef-ledger-statement-panel";
import { ChefBankOnboardingPanel } from "@/features/chef/components/chef-bank-onboarding-panel";
import { EmailVerificationPanel } from "@/features/sign-in/components/EmailVerificationPanel";
export const metadata = {title: "Balance and payouts | Craves Chef", robots: {index: false, follow: false}};
export default function ChefFinancePage() {
  return <main className="chef-page is-narrow">
    <ChefAccessBoundary>
      <ChefPageHeader title="Balance & payouts" description="Take out your money, and see your bank account." back={{href: "/chef/earnings", label: "Earnings"}} />
      {/* The short email form: a signed-in chef only needs to see it's verified, or fix it. */}
      <div className="chef-stack"><ChefWithdrawalPanel /><ChefBankOnboardingPanel /><EmailVerificationPanel required compact /><ChefLedgerStatementPanel /></div>
    </ChefAccessBoundary>
  </main>;
}

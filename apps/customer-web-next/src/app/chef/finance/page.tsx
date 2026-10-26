import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefPageHeader } from "@/features/chef/components/chef-page-header";
import { ChefWithdrawalPanel } from "@/features/chef/components/chef-withdrawal-panel";
import { EmailVerificationPanel } from "@/features/sign-in/components/EmailVerificationPanel";
export const metadata = {title: "Balance and payouts | Craves Chef", robots: {index: false, follow: false}};
// The bank account has its own page and every PDF is made on Statements; this page is the money itself.
export default function ChefFinancePage() {
  return <main className="chef-page is-narrow">
    <ChefAccessBoundary>
      <ChefPageHeader title="Balance & payouts" description="Take out your money, and see how it is worked out." back={{href: "/chef/earnings", label: "Earnings"}} />
      {/* The short email form: a signed-in chef only needs to see it's verified, or fix it. */}
      <div className="chef-stack"><ChefWithdrawalPanel /><EmailVerificationPanel required compact /></div>
    </ChefAccessBoundary>
  </main>;
}

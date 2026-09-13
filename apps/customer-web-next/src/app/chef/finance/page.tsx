import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefPageHeader } from "@/components/chef-page-header";
import { ChefWithdrawalPanel } from "@/components/chef-withdrawal-panel";
export const metadata = {title: "Chef balance and withdrawals | Craves", robots: {index: false, follow: false}};
export default function ChefFinancePage() {
  return <main className="mx-auto min-h-screen max-w-7xl px-4 py-6"><ChefPageHeader eyebrow="Chef finance" title="Balance and withdrawal requests" description="Review verified available earnings, scheduled payouts and bank confirmation. Existing historical earnings are not silently imported as new withdrawable funds." /><div className="mt-6"><ChefAccessBoundary><ChefWithdrawalPanel /></ChefAccessBoundary></div></main>;
}

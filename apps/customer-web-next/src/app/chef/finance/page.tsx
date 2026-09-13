import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefPageHeader } from "@/components/chef-page-header";
import { ChefWithdrawalPanel } from "@/components/chef-withdrawal-panel";
import { ChefLedgerStatementPanel } from "@/components/chef-ledger-statement-panel";
export const metadata = {title: "Chef balance and withdrawals | Craves", robots: {index: false, follow: false}};
export default function ChefFinancePage() {
  return <main className="mx-auto min-h-screen max-w-7xl px-4 py-6"><ChefPageHeader eyebrow="Chef finance" title="Balance, statements and withdrawal requests" description="Review posted earnings, separate fee and tax deductions, scheduled payouts and confirmed transfers. Historical allocations are not silently imported as new withdrawable money." /><div className="mt-6"><ChefAccessBoundary><ChefWithdrawalPanel /><ChefLedgerStatementPanel /></ChefAccessBoundary></div></main>;
}

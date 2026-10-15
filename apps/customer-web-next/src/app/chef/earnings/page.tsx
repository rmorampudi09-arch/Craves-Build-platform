import Link from "next/link";
import { ChevronRight, FileText, History, Landmark } from "lucide-react";
import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefEarningsLedger } from "@/features/chef/components/chef-earnings-ledger";
import { ChefPageHeader } from "@/features/chef/components/chef-page-header";

export const metadata = {
  title: "Earnings | Craves Chef",
  robots: { index: false, follow: false },
};

// The rest of the money pages; Balance & payouts is the button beside the title.
const MONEY_LINKS = [
  { href: "/chef/earnings/payouts", icon: History, label: "Payout history", description: "Money sent to your bank" },
  { href: "/chef/statements", icon: FileText, label: "Statements", description: "PDF records to keep or share" },
  { href: "/chef/bank", icon: Landmark, label: "Bank account", description: "Where Craves sends your money" },
] as const;

export default function ChefEarningsPage() {
  return (
    <main className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefPageHeader
          title="Earnings"
          description="Money from your delivered orders."
          action={<Link href="/chef/finance" className="chef-btn is-small">Balance &amp; payouts</Link>}
        />
        <ChefEarningsLedger>
          <nav aria-label="Payouts, statements and bank account" className="chef-section chef-list">
            {MONEY_LINKS.map(({ href, icon: Icon, label, description }) => (
              <Link key={href} href={href} className="chef-row">
                <span className="chef-row-icon"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                <span className="chef-row-main">
                  <span className="chef-row-title block">{label}</span>
                  <span className="chef-row-meta block">{description}</span>
                </span>
                <ChevronRight className="chef-chevron h-5 w-5" aria-hidden="true" />
              </Link>
            ))}
          </nav>
        </ChefEarningsLedger>
      </ChefAccessBoundary>
    </main>
  );
}

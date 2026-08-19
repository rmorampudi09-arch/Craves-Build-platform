import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefEarningsLedger } from "@/components/chef-earnings-ledger";

export const metadata = {
  title: "What I've earned | Craves",
  robots: { index: false, follow: false },
};

export default function ChefEarningsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-6 md:px-6 md:py-8">
      <ChefAccessBoundary>
        <ChefEarningsLedger />
      </ChefAccessBoundary>
    </main>
  );
}

import { FinanceWorkspace } from "@/features/admin/finance/components/finance-workspace";
import { initialView } from "@/features/admin/finance/lib/insights-contract";
import { ChefTaxProfilePanel } from "@/features/chef/components/chef-tax-profile-panel";

export default async function FinancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <FinanceWorkspace initial={initialView(await searchParams)} taxProfiles={<ChefTaxProfilePanel />} />;
}

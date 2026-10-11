import { AdminAccountIntervention } from "@/features/admin/accounts/components/admin-account-intervention";
import { AdminPageIntro } from "@/features/admin/shell/components/admin-page-intro";

export const dynamic = "force-dynamic";

export default function AdminAccountsPage() {
  return <div className="space-y-7">
    <AdminPageIntro eyebrow="Security operations" title="Account suspension and reactivation" description="A controlled administrator surface for exact-identity intervention. Every decision is re-authorized, audited and synchronized through the owning Auth Service." />
    <AdminAccountIntervention />
  </div>;
}

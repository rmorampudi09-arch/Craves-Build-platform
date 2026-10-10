import { AdminPageIntro } from "@/components/admin-page-intro";
import { AdminSupportInbox } from "@/components/admin-support-inbox";

export const metadata = { title: "Support inbox | Craves Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function AdminSupportPage() {
  return <div className="space-y-7">
    <AdminPageIntro eyebrow="Customer & chef support" title="Support inbox" description="Tickets opened by customers, chefs and the Craves support assistant. User-chef Service enforces the support administrator role on every read and action." />
    <AdminSupportInbox />
  </div>;
}

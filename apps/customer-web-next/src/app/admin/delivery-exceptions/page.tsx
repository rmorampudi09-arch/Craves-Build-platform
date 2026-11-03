import { DeliveryExceptionsConsole } from "@/features/admin/delivery-exceptions/delivery-exceptions-console";
import { AdminPageIntro } from "@/features/admin/shell/components/admin-page-intro";

export const metadata = { title: "Delivery exceptions | Craves Admin", robots: { index: false, follow: false } };

export default function AdminDeliveryExceptionsPage() {
  return <div className="space-y-7">
    <AdminPageIntro eyebrow="Orders & delivery" title="Delivery exceptions" description="Open a case when a delivery goes wrong, take ownership, ask for another provider and record how it ended. Cases only record the work: switch providers with the existing delivery tools, then resolve the case." />
    <DeliveryExceptionsConsole />
  </div>;
}

import { DeadLettersConsole } from "@/features/admin/dead-letters/dead-letters-console";
import { AdminPageIntro } from "@/features/admin/shell/components/admin-page-intro";

export const metadata = { title: "Dead letters | Craves Admin", robots: { index: false, follow: false } };

export default function AdminDeadLettersPage() {
  return <div className="space-y-7">
    <AdminPageIntro eyebrow="Orders & delivery" title="Dead letters" description="Delivery webhooks, Cashfree webhooks and delivery commands that failed or that the retries gave up on, with why. Read-only: nothing here retries or changes them, and every view is recorded with your reason." />
    <DeadLettersConsole />
  </div>;
}

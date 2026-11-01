import { AdminPageIntro } from "@/features/admin/shell/components/admin-page-intro";
import { AdminReviewModeration } from "@/features/admin/reviews/components/admin-review-moderation";

export const metadata = { title: "Customer reviews | Craves Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function AdminReviewsPage() {
  return <div className="space-y-7">
    <AdminPageIntro eyebrow="Trust & safety" title="Customer reviews" description="Reviews wait here until an admin publishes them. Published reviews show on the kitchen page, in the Home rating and to the chef. Every decision needs a reason and is recorded with your account; Order Service enforces the ADMIN or SUPPORT_ADMIN role." />
    <AdminReviewModeration />
  </div>;
}

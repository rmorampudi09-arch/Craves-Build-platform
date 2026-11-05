import { AdminPageIntro } from "@/features/admin/shell/components/admin-page-intro";
import { DeletionRequestList } from "@/features/admin/account-deletions/components/deletion-request-list";

export const metadata = { title: "Deletion requests | Craves Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function AdminAccountDeletionsPage() {
  return <div className="space-y-7">
    <AdminPageIntro eyebrow="People & kitchens" title="Deletion requests" description="People who asked to delete their account wait here for review. Open a request to see what is still open and the deletion steps, then approve or reject with a reason. The backend enforces who may decide." />
    <DeletionRequestList />
  </div>;
}

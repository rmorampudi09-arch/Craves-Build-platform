import { notFound } from "next/navigation";
import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefSupportTicket } from "@/features/chef/components/chef-support";
import { isUuid } from "@/shared/lib/server-api";

export const metadata = {
  title: "Your ticket | Craves Chef",
  robots: { index: false, follow: false },
};

export default async function ChefSupportTicketPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  if (!isUuid(caseId)) notFound();
  return (
    <main className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefSupportTicket caseId={caseId} />
      </ChefAccessBoundary>
    </main>
  );
}

import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefSupportTicket } from "@/features/chef/components/chef-support";
import { ticketTopic } from "@/features/chef/lib/chef-support";
import { isUuid } from "@/shared/lib/server-api";

export const metadata = {
  title: "New ticket | Craves Chef",
  robots: { index: false, follow: false },
};

export default async function ChefSupportNewTicketPage({
  searchParams,
}: {
  searchParams: Promise<{
    topic?: string | string[];
    orderId?: string | string[];
    from?: string | string[];
  }>;
}) {
  const { topic, orderId, from } = await searchParams;
  return (
    <main className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefSupportTicket
          topic={ticketTopic(typeof topic === "string" ? topic : null)}
          orderId={typeof orderId === "string" && isUuid(orderId) ? orderId : null}
          from={typeof from === "string" ? from : null}
        />
      </ChefAccessBoundary>
    </main>
  );
}

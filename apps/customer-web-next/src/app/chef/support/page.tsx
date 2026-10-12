import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefPageHeader } from "@/features/chef/components/chef-page-header";
import { SupportChat } from "@/features/support/components/SupportChat";
import { shortOrderNumber } from "@/shared/lib/order-number";
import { isUuid } from "@/shared/lib/server-api";

export const metadata = {
  title: "Chef support | Craves",
  robots: { index: false, follow: false },
};

export default async function ChefSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string | string[] }>;
}) {
  const { orderId } = await searchParams;
  const order = typeof orderId === "string" && isUuid(orderId) ? orderId : undefined;
  const number = order ? shortOrderNumber(order) : null;
  return (
    <main className="chef-page is-narrow">
      {/* Opened from an order, Back returns to that order; otherwise to More, where Get help lives. */}
      <ChefPageHeader
        title="Get help"
        description={number ? `About order #${number}.` : "Ask about your kitchen, orders or money. A person from Craves helps with anything the assistant can’t."}
        back={order ? { href: `/chef/orders/${order}`, label: `Order #${number}` } : { href: "/chef/profile", label: "More" }}
      />
      <section className="chef-section chef-support-chat">
        <ChefAccessBoundary>
          <SupportChat contextRole="CHEF" orderId={order} />
        </ChefAccessBoundary>
      </section>
    </main>
  );
}

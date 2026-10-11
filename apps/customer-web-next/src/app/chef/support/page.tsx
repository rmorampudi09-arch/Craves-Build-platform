import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefPageHeader } from "@/features/chef/components/chef-page-header";
import { SupportChat } from "@/features/support/components/SupportChat";
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
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-6 md:px-6 md:py-8">
      <ChefPageHeader
        eyebrow="Help"
        title="Support"
        description={order ? `Get help with order #${order.slice(-8).toUpperCase()}.` : "Ask about your kitchen, orders or payouts. Our team picks up anything the assistant can't solve."}
      />
      <section className="mt-6 flex h-[70dvh] flex-col rounded-3xl border border-[#E5E7EB] bg-white px-4 pb-4 sm:px-6">
        <ChefAccessBoundary>
          <SupportChat contextRole="CHEF" orderId={order} />
        </ChefAccessBoundary>
      </section>
    </main>
  );
}

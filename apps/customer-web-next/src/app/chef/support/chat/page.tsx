import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefPageHeader } from "@/features/chef/components/chef-page-header";
import { pageText } from "@/features/chef/lib/chef-page-text";
import { SupportChat } from "@/features/support/components/SupportChat";
import { format } from "@/shared/i18n/language";
import { requestLanguage } from "@/shared/i18n/server-language";
import { shortOrderNumber } from "@/shared/lib/order-number";
import { isUuid } from "@/shared/lib/server-api";

export const metadata = {
  title: "Chat with us | Craves Chef",
  robots: { index: false, follow: false },
};

export default async function ChefSupportChatPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string | string[] }>;
}) {
  const { orderId } = await searchParams;
  const order = typeof orderId === "string" && isUuid(orderId) ? orderId : undefined;
  const number = order ? shortOrderNumber(order) : null;
  // These two carry the order number, so they are put into the chef's language here, not by the header.
  const language = (await requestLanguage()) ?? "en";
  const withNumber = (english: string) => format(pageText(english, language), { number: number ?? "" });
  return (
    <main className="chef-page is-narrow">
      {/* Opened from an order, Back returns to that order; otherwise to Help & support. */}
      <ChefPageHeader
        title="Chat with us"
        description={number ? withNumber("About order #{number}.") : "Ask about your kitchen, orders or money. A person from Craves helps with anything the assistant can’t."}
        back={order ? { href: `/chef/orders/${order}`, label: withNumber("Order #{number}") } : { href: "/chef/support", label: "Help & support" }}
      />
      <section className="chef-section chef-support-chat">
        <ChefAccessBoundary>
          <SupportChat contextRole="CHEF" orderId={order} />
        </ChefAccessBoundary>
      </section>
    </main>
  );
}

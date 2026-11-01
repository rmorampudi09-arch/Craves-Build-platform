import { redirect } from "next/navigation";
import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefPageHeader } from "@/features/chef/components/chef-page-header";
import { ChefSupportHub } from "@/features/chef/components/chef-support";
import { isUuid } from "@/shared/lib/server-api";

export const metadata = {
  title: "Help & support | Craves Chef",
  robots: { index: false, follow: false },
};

export default async function ChefSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string | string[] }>;
}) {
  const { orderId } = await searchParams;
  // "Get help" on an order still opens the chat about that order.
  if (typeof orderId === "string" && isUuid(orderId))
    redirect(`/chef/support/chat?orderId=${orderId}`);
  return (
    <main className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefPageHeader title="Help & support" back={{ href: "/chef/profile", label: "Profile" }} />
        <ChefSupportHub />
      </ChefAccessBoundary>
    </main>
  );
}

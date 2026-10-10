import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefOrderDetails } from "@/components/chef-order-details";

export const metadata = {
  title: "Chef order | Craves",
  robots: { index: false, follow: false },
};

export default async function ChefOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return (
    <main className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefOrderDetails orderId={orderId} />
      </ChefAccessBoundary>
    </main>
  );
}

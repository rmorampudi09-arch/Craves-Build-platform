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
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-6 md:px-6 md:py-8">
      <ChefAccessBoundary>
        <ChefOrderDetails orderId={orderId} />
      </ChefAccessBoundary>
    </main>
  );
}

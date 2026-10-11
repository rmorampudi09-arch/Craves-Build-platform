import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefOrderInbox } from "@/features/chef/components/chef-order-inbox";

export const metadata = {
  title: "Chef orders | Craves",
  robots: { index: false, follow: false },
};

export default function ChefOrdersPage() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-6 md:px-6 md:py-8">
      <ChefAccessBoundary>
        <ChefOrderInbox />
      </ChefAccessBoundary>
    </main>
  );
}

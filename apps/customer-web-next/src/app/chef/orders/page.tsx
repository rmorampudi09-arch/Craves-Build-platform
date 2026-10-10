import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefOrderInbox } from "@/components/chef-order-inbox";

export const metadata = {
  title: "Chef orders | Craves",
  robots: { index: false, follow: false },
};

export default function ChefOrdersPage() {
  return (
    <main className="chef-page">
      <ChefAccessBoundary>
        <ChefOrderInbox />
      </ChefAccessBoundary>
    </main>
  );
}

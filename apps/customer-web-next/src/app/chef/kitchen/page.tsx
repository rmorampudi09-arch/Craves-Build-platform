import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefKitchenForm } from "@/features/chef/components/chef-kitchen-form";

export const metadata = {
  title: "Kitchen details | Craves",
  robots: { index: false, follow: false },
};

export default function ChefKitchenPage() {
  return (
    <main className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefKitchenForm />
      </ChefAccessBoundary>
    </main>
  );
}

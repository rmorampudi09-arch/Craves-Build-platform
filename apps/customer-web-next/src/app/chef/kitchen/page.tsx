import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefKitchenForm } from "@/components/chef-kitchen-form";

export const metadata = {
  title: "My kitchen | Craves",
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

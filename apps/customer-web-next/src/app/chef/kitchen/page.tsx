import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefKitchenForm } from "@/components/chef-kitchen-form";

export const metadata = {
  title: "My kitchen | Craves",
  robots: { index: false, follow: false },
};

export default function ChefKitchenPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-6 md:px-6 md:py-8">
      <ChefAccessBoundary>
        <ChefKitchenForm />
      </ChefAccessBoundary>
    </main>
  );
}

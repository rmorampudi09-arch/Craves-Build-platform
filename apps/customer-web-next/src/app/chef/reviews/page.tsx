import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefReviews } from "@/features/chef/components/chef-reviews";

export const metadata = {
  title: "Reviews | Craves Chef",
  robots: { index: false, follow: false },
};

export default function ChefReviewsPage() {
  return (
    <main className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefReviews />
      </ChefAccessBoundary>
    </main>
  );
}

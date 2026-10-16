import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefMoreHub } from "@/features/chef/components/chef-more-hub";
import { ChefPageHeader } from "@/features/chef/components/chef-page-header";

export const metadata = {
  title: "More | Craves Chef",
  robots: { index: false, follow: false },
};

export default function ChefMorePage() {
  return (
    <main className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefPageHeader title="More" description="Your kitchen, settings and account." />
        <ChefMoreHub />
      </ChefAccessBoundary>
    </main>
  );
}

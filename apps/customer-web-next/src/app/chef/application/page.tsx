import { ChefApplicationWorkspace } from "@/components/chef-application-workspace";

export const metadata = {
  title: "Become a chef | Craves",
  robots: { index: false, follow: false },
};

export default function ChefApplicationPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-6 md:px-6 md:py-8">
      <ChefApplicationWorkspace />
    </main>
  );
}

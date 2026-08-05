import { ChefApplicationWorkspace } from "@/components/chef-application-workspace";
import { ChefPageHeader } from "@/components/chef-page-header";

export const metadata = {
  title: "Chef application | Craves",
  robots: { index: false, follow: false },
};

export default function ChefApplicationPage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <ChefPageHeader
        eyebrow="Onboarding and evidence"
        title="Chef application"
        description="Submit the current backend application fields and supported proof files. Approval, rejection notes and document review remain controlled by authorized Craves administrators."
      />
      <div className="mt-6">
        <ChefApplicationWorkspace />
      </div>
    </main>
  );
}

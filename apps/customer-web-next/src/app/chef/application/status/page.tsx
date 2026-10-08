import { ChefApplicationSessionBoundary } from "@/components/chef-application-session-boundary";
import { ChefApplicationStatus } from "@/components/chef-application-status";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Chef application status | Craves",
  robots: { index: false, follow: false },
};
export default function ChefApplicationStatusPage() {
  return (
    <ChefApplicationSessionBoundary authMode="login" returnTo="/chef/application/status">
      <main className="mx-auto min-h-screen max-w-3xl px-4 py-6">
        <ChefApplicationStatus
          draftsEnabled={process.env.CRAVES_CHEF_ONBOARDING_V2_ENABLED === "true"}
        />
      </main>
    </ChefApplicationSessionBoundary>
  );
}

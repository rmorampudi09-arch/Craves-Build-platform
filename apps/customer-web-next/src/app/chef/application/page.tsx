import { ChefOnboardingWorkspace } from "@/features/chef-onboarding/components/chef-onboarding-workspace";
import { ChefApplicationWorkspace } from "@/features/chef-onboarding/components/chef-application-workspace";
import { ChefReadinessPanel } from "@/features/chef/components/chef-readiness-panel";
import { ChefApplicationSessionBoundary } from "@/features/chef-onboarding/components/chef-application-session-boundary";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Become a chef | Craves",
  robots: { index: false, follow: false },
};

export default function ChefApplicationPage() {
  const legacyWorkspace = <><ChefApplicationWorkspace /><div className="mt-6"><ChefReadinessPanel /></div></>;
  return (
    <ChefApplicationSessionBoundary>
      <main className="mx-auto min-h-screen max-w-3xl px-4 py-6 md:px-6 md:py-8">
        {process.env.CRAVES_CHEF_ONBOARDING_V2_ENABLED === "true" ? <ChefOnboardingWorkspace fallback={legacyWorkspace} /> : legacyWorkspace}
      </main>
    </ChefApplicationSessionBoundary>
  );
}

import { ChefOnboardingWorkspace } from "@/components/chef-onboarding-workspace";
import { ChefApplicationWorkspace } from "@/components/chef-application-workspace";
import { ChefReadinessPanel } from "@/components/chef-readiness-panel";
import { ChefApplicationSessionBoundary } from "@/components/chef-application-session-boundary";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Become a chef | Craves",
  robots: { index: false, follow: false },
};

export default function ChefApplicationPage() {
  const legacyWorkspace = <><ChefApplicationWorkspace /><div className="mt-6"><ChefReadinessPanel /></div></>;
  return (
    <ChefApplicationSessionBoundary>
      <main className="chef-page is-narrow">
        {process.env.CRAVES_CHEF_ONBOARDING_V2_ENABLED === "true" ? <ChefOnboardingWorkspace fallback={legacyWorkspace} /> : legacyWorkspace}
      </main>
    </ChefApplicationSessionBoundary>
  );
}

import { ChefApplicationDocumentPanel } from "@/components/chef-application-document-panel";
import { ChefApplicationWorkspace } from "@/components/chef-application-workspace";
import { ChefPageHeader } from "@/components/chef-page-header";
import { ChefBankOnboardingPanel } from "@/components/chef-bank-onboarding-panel";

export const metadata = {title: "Chef application | Craves", robots: {index: false, follow: false}};
export default function ChefApplicationPage() {
  return <main className="mx-auto min-h-screen max-w-6xl px-4 py-6 md:px-6 md:py-8">
    <ChefPageHeader eyebrow="Onboarding and evidence" title="Chef application"
      description="Submit your chef details and required documents, then add your payout account. Razorpay bank validation is automatic; chef application approval remains separate." />
    <div className="mt-6 space-y-6">
      <div className="[&>div>section:last-child]:hidden"><ChefApplicationWorkspace /></div>
      <ChefBankOnboardingPanel />
      <ChefApplicationDocumentPanel />
    </div>
  </main>;
}

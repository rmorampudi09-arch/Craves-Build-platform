import { AdminPageIntro } from "@/components/admin-page-intro";
import { AdminChefOnboardingContent } from "@/components/admin-chef-onboarding-content";
export const metadata={title:"Chef onboarding help | Craves Admin",robots:{index:false,follow:false}};
export const dynamic="force-dynamic";
export default function ChefOnboardingAdminPage() {
  return <div className="space-y-7"><AdminPageIntro eyebrow="Chef onboarding" title="Learning and FSSAI support"
    description="Publish articles and videos by language and track chef requests for FSSAI assistance." />
    <AdminChefOnboardingContent /></div>;
}

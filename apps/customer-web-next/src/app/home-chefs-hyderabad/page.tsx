import Link from "next/link";
import { PolicyList, PolicySection, PublicPolicyPage } from "@/components/legal/PublicPolicyPage";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbData, publicMetadata } from "@/lib/public-seo";

export const metadata = publicMetadata(
  "Home Chefs in Hyderabad",
  "Share your homemade food with Hyderabad through Craves. Learn about chef applications, kitchen approval, menu preparation and support before getting started.",
  "/home-chefs-hyderabad",
);

export default function HyderabadChefsPage() {
  return <>
    <JsonLd data={breadcrumbData("Home chefs in Hyderabad", "/home-chefs-hyderabad")} />
    <PublicPolicyPage eyebrow="For home chefs · Hyderabad" title="Bring your home kitchen to Craves."
      intro="Craves helps Hyderabad home chefs present their meals and manage orders through one marketplace. Your application and kitchen details are reviewed before your chef account is approved.">
      <nav aria-label="Breadcrumb"><Link href="/">Craves</Link> / Home chefs in Hyderabad</nav>
      <PolicySection title="Start with your chef application">
        <ol className="list-decimal space-y-3 pl-5">
          <li>Open the chef application and sign in using the account you want to use for your kitchen.</li>
          <li>Complete the requested profile, kitchen, contact and document details accurately.</li>
          <li>Submit your information for review. Follow any requests for corrections or further information.</li>
          <li>After approval, use the chef tools to manage the menu and incoming orders available to your account.</li>
        </ol>
        <p><Link className="font-semibold text-[#F62E18] underline" href="/chef/application">Start your chef application</Link></p>
      </PolicySection>
      <PolicySection title="Prepare a useful menu">
        <PolicyList>
          <li>Use clear dish names and descriptions that explain what a customer receives.</li>
          <li>Upload accurate photographs of the meals you offer.</li>
          <li>Keep prices, availability and food-type information up to date.</li>
          <li>Provide the ingredient and allergen information requested in the current chef flow.</li>
          <li>Plan preparation and packaging around the orders your kitchen can actually fulfil.</li>
        </PolicyList>
      </PolicySection>
      <PolicySection title="Your kitchen and local customers">
        <p>Customers search for home food using their delivery address. Kitchen location, menu availability and delivery options influence which meals they can order. Joining Craves does not guarantee orders or delivery coverage across all of Hyderabad.</p>
        <p>Customers can learn more on our <Link className="underline" href="/homemade-food-hyderabad">homemade food in Hyderabad page</Link> and browse the <Link className="underline" href="/products-pricing">current public dishes and prices</Link>.</p>
      </PolicySection>
      <PolicySection title="Questions before you join">
        <h3 className="font-semibold">Is approval automatic?</h3>
        <p>No. Your chef application and submitted details go through review. Submit accurate information and use the application to follow its status.</p>
        <h3 className="font-semibold">Which documents do I need?</h3>
        <p>The chef application lists the current required details and documents. Follow those requirements and contact the team if a requirement is unclear.</p>
        <h3 className="font-semibold">What are the fees and payout terms?</h3>
        <p>Review the current terms and finance information provided through Craves before accepting orders. Contact the team for clarification; this guide does not promise an earnings amount, commission rate or payout schedule.</p>
        <h3 className="font-semibold">Where can I get onboarding help?</h3>
        <p>Visit <Link className="font-semibold text-[#F62E18] underline" href="/contact">Contact Craves</Link> for home-chef programme and business enquiries.</p>
      </PolicySection>
    </PublicPolicyPage>
  </>;
}

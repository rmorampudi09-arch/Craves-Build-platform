import Link from "next/link";
import { PolicyList, PolicySection, PublicPolicyPage } from "@/components/legal/PublicPolicyPage";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbData, publicMetadata } from "@/lib/public-seo";

export const metadata = publicMetadata(
  "Homemade Food in Hyderabad",
  "Explore homemade meals from Hyderabad home chefs on Craves. Learn how to find kitchens, check delivery availability, compare dishes and place an order.",
  "/homemade-food-hyderabad",
);

export default function HyderabadFoodPage() {
  return <>
    <JsonLd data={breadcrumbData("Homemade food in Hyderabad", "/homemade-food-hyderabad")} />
    <PublicPolicyPage eyebrow="Home food · Hyderabad" title="Homemade food in Hyderabad, from real home kitchens."
      intro="Craves connects people in Hyderabad with home chefs and their homemade meals. Find something that feels like home, check the kitchen and dish details, and confirm delivery for your address before ordering.">
      <nav aria-label="Breadcrumb"><Link href="/">Craves</Link> / Homemade food in Hyderabad</nav>
      <PolicySection title="How to find a meal near you">
        <ol className="list-decimal space-y-3 pl-5">
          <li>Open Craves and sign in or create your customer account.</li>
          <li>Select your delivery address so Craves can show the kitchens and dishes available for your location.</li>
          <li>Review the dish description, food type, price and kitchen details. Menus and availability can change.</li>
          <li>Review the complete payable amount and available delivery information at checkout before placing your order.</li>
        </ol>
        <p><Link className="font-semibold text-[#F62E18] underline" href="/#sign-in">Find home food on Craves</Link>{" · "}
          <Link className="font-semibold text-[#F62E18] underline" href="/products-pricing">View current dishes and prices</Link></p>
      </PolicySection>
      <PolicySection title="Check availability across Hyderabad">
        <p>Whether you are looking from Kukatpally, KPHB, Miyapur, Chandanagar, Kondapur, Gachibowli, Madhapur, HITEC City, Manikonda, Nallagandla, Jubilee Hills, Banjara Hills, Ameerpet, Begumpet, Secunderabad, Malkajgiri, Uppal or LB Nagar, start with your exact delivery address.</p>
        <p>These are areas where customers may look for home food, not a guarantee of live coverage. A kitchen’s availability, its delivery range and the delivery options for your order determine whether it can serve you. If no suitable meal appears, try again when kitchens update their menus.</p>
      </PolicySection>
      <PolicySection title="Choosing your everyday home food">
        <p>Breakfast, lunch, snacks and dinner choices depend on what participating chefs have made available. Use the live menu to compare portions, descriptions and prices instead of relying on an old post or a promotional image.</p>
        <PolicyList>
          <li>Check vegetarian or non-vegetarian information on each dish.</li>
          <li>Read the available ingredient and dish details. If you have a food allergy, ask for clarification before ordering; do not assume a meal is allergen-free.</li>
          <li>For a recurring meal plan, review the current plan, dates and terms shown inside Craves before subscribing.</li>
        </PolicyList>
      </PolicySection>
      <PolicySection title="Questions about ordering">
        <h3 className="font-semibold">Does Craves deliver to every Hyderabad address?</h3>
        <p>Availability is checked for your selected address and the chosen kitchen. This page does not promise delivery to every neighbourhood or pin code.</p>
        <h3 className="font-semibold">Where can I see prices?</h3>
        <p>The <Link className="underline" href="/products-pricing">products and pricing page</Link> shows dishes from the public catalog. The final total is displayed at checkout before payment.</p>
        <h3 className="font-semibold">Can I order without an app-store download?</h3>
        <p>You can start on the Craves website through its customer sign-in. Official store download links will appear when they are available.</p>
        <h3 className="font-semibold">How do I get help with an order?</h3>
        <p>Use the <Link className="underline" href="/contact">contact page</Link> for support. Keep your order reference ready, and review the <Link className="underline" href="/refunds-cancellations">refund and cancellation policy</Link> for the applicable terms.</p>
      </PolicySection>
      <PolicySection title="Cook for your Hyderabad community">
        <p>Do you cook homemade meals? Read our <Link className="font-semibold text-[#F62E18] underline" href="/home-chefs-hyderabad">guide for Hyderabad home chefs</Link> to learn about the application and approval process.</p>
      </PolicySection>
    </PublicPolicyPage>
  </>;
}

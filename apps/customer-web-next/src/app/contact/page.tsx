import { PolicySection, PublicPolicyPage } from "@/components/legal/PublicPolicyPage";

export const metadata = {
  title: "Contact Us | Craves",
  description: "Contact Craves for customer support, order help, and business enquiries.",
};

export default function ContactPage() {
  return (
    <PublicPolicyPage
      eyebrow="Contact us"
      title="We’re here to help."
      intro="Craves is a Hyderabad-based homemade food marketplace. Use the addresses below for order support, account help, payment/refund questions, or business enquiries."
    >
      <PolicySection title="Customer support">
        <p>
          For order, payment, refund, account, chef-order, or delivery help, email{" "}
          <a className="font-semibold text-[#F62E18] underline" href="mailto:support@craves.in">
            support@craves.in
          </a>.
        </p>
        <p>Please include your Craves order reference when one is available. Never send a card number, CVV, UPI PIN, OTP, password, or API secret by email.</p>
      </PolicySection>

      <PolicySection title="Business and partnerships">
        <p>
          For partnerships, media, home-chef programmes, or business enquiries, email{" "}
          <a className="font-semibold text-[#F62E18] underline" href="mailto:contact@craves.in">
            contact@craves.in
          </a>.
        </p>
      </PolicySection>

      <PolicySection title="Location">
        <p>Craves · Hyderabad, Telangana, India.</p>
      </PolicySection>
    </PublicPolicyPage>
  );
}

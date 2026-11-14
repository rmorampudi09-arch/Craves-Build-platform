import { PolicyList, PolicySection, PublicPolicyPage } from "@/features/legal/components/PublicPolicyPage";

export const metadata = {
  title: "Security | Craves",
  description: "How Craves protects your account, data and payments: Microsoft Azure in India, encrypted connections, OTP sign-in and Razorpay's secure checkout.",
};

export default function SecurityPage() {
  return (
    <PublicPolicyPage
      eyebrow="Security"
      title="Protecting Craves accounts and payments."
      intro="Craves is built with enterprise-grade security. Public customer applications are kept apart from backend service credentials, and payment state is verified on the server. Customers can also help by keeping authentication and payment secrets private."
    >
      <PolicySection title="How Craves protects your account and data">
        <PolicyList>
          <li>Craves runs on Microsoft Azure in India.</li>
          <li>Each part of the platform runs separately, with its own encrypted vault for keys and passwords.</li>
          <li>craves.in is served through Azure Front Door with a web application firewall, over encrypted connections.</li>
          <li>You sign in with a one-time password sent to your phone.</li>
          <li>Craves staff use a separate admin portal with its own sign-in and role-based access.</li>
        </PolicyList>
      </PolicySection>

      <PolicySection title="What Craves will never ask you to send">
        <PolicyList>
          <li>Your UPI PIN.</li>
          <li>Your card CVV.</li>
          <li>Your banking password.</li>
          <li>A Firebase OTP or account password by email.</li>
          <li>Internal Craves API keys, Azure secrets, or provider credentials.</li>
        </PolicyList>
      </PolicySection>

      <PolicySection title="Payment verification">
        <p>
          Payment checkout is hosted by Razorpay. Craves treats payment as final only after server-side provider verification or a verified signed provider event; a browser redirect by itself is not trusted as proof of payment.
        </p>
      </PolicySection>

      <PolicySection title="Report a concern">
        <p>
          If you believe your Craves account, order, or payment was accessed without permission, contact{" "}
          <a className="font-semibold text-[#F62E18] underline" href="mailto:support@craves.in">support@craves.in</a>.
          Include the relevant Craves order reference if available, but do not include payment secrets.
        </p>
      </PolicySection>
    </PublicPolicyPage>
  );
}

import Link from "next/link";
import { PolicyList, PolicySection, PublicPolicyPage } from "@/features/legal/components/PublicPolicyPage";

export const metadata = {
  title: "Delete your Craves account | Craves",
  description: "How to ask Craves to delete your account, what is deleted, and what Craves keeps and for how long.",
};

const linkClass = "font-semibold text-[#F62E18] underline";
const support = <a className={linkClass} href="mailto:support@craves.in">support@craves.in</a>;

export default function AccountDeletionPage() {
  return (
    <PublicPolicyPage
      eyebrow="Account deletion"
      title="Delete your Craves account"
      intro="You can ask Craves to delete your account and its data, from the Craves app or from this website. This page explains how, what is deleted, and what Craves keeps and for how long."
    >
      <PolicySection title="How to ask">
        <PolicyList>
          <li>In the Craves app: customers go to Profile → Settings → Privacy &amp; security → Delete account. Chefs go to Profile → Login &amp; security → Delete my account.</li>
          <li>On the website: sign in at <Link className={linkClass} href="/account/delete">craves.in/account/delete</Link> with the phone number on your account.</li>
          <li>If you can&apos;t sign in, email {support} from the email on your account, or send the phone number on the account, and Craves will help.</li>
        </PolicyList>
      </PolicySection>

      <PolicySection title="What happens and when">
        <PolicyList>
          <li>Customer accounts are deleted 30 days after you ask.</li>
          <li>Chef accounts: your kitchen stops taking new orders at once. Craves reviews the request and settles your payouts, then your chef details are deleted 30 days after approval.</li>
          <li>If you use Craves as a chef and as a customer, you can delete one side or the whole account.</li>
          <li>Until the deletion date you can change your mind with Keep my account, in the app or on this website.</li>
        </PolicyList>
      </PolicySection>

      <PolicySection title="What is deleted">
        <p>
          Your profile, name, phone number and email; saved addresses; favourites and saved lists; reviews you wrote; meal plans; notifications and taste data; referral credits you haven&apos;t used. For chefs: kitchen profile and photos, menu and dish photos, meal plans you offer, and chef application details.
        </p>
      </PolicySection>

      <PolicySection title="What Craves keeps, and for how long">
        <PolicyList>
          <li>Past orders, payments and refunds: kept for 8 years after the end of the financial year, with your name and phone number removed, because Indian tax law requires it.</li>
          <li>For chefs: KYC documents, bank details, earnings and payout records: kept locked for 8 years after the end of the financial year, because Indian tax law requires it, then deleted.</li>
          <li>One-way security codes made from your phone, device and payment method (not the details themselves): kept for 8 years so a new account can&apos;t claim the new-customer offer again.</li>
        </PolicyList>
      </PolicySection>

      <PolicySection title="Questions">
        <p>Write to {support}.</p>
      </PolicySection>
    </PublicPolicyPage>
  );
}

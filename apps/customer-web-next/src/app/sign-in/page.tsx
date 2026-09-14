import { PhoneAuthForm } from "@/components/phone-auth-form";
import { CravesLogo } from "@/components/brand/CravesLogo";
import { safeReturnPath } from "@/lib/auth-contract";
import { isAdminDestination } from "@/lib/admin-navigation";
import "@/styles/admin-control.css";

export const metadata = {
  title: "Sign in | Craves",
  robots: { index: false, follow: false }
};

export default async function SignInPage({ searchParams }: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const query = await searchParams;
  const destination = safeReturnPath(query.returnTo);
  const adminJourney = process.env.CRAVES_ADMIN_PORTAL === "true" || isAdminDestination(destination);
  // Never default an administrator sign-in to the public customer home page.
  const returnTo = adminJourney ? (isAdminDestination(destination) ? destination : "/admin") : destination;
  if (!adminJourney) return <main className="mx-auto flex min-h-screen max-w-xl items-center px-5 py-12"><PhoneAuthForm returnTo={returnTo}/></main>;

  return <main className="cr-admin cr-login">
    <section className="cr-login-story" aria-labelledby="cr-login-title">
      <div className="cr-brand"><CravesLogo size="lg" priority/><span><strong>Craves</strong><small>ADMINISTRATION</small></span></div>
      <div><p className="cr-eyebrow">Made for the people behind every meal</p><h2 id="cr-login-title">One workspace.<br/>Everyday control.</h2><p>Care for your customers. Support your home chefs. Keep orders, delivery and finance moving together.</p></div>
      <div className="cr-login-features"><span>Orders & delivery</span><span>People & kitchens</span><span>Finance & subscriptions</span><span>Recovery & learning</span></div>
      <p className="cr-login-quote">Different kitchens. Different recipes.<br/><strong>One feeling — home.</strong></p>
    </section>
    <div className="cr-login-form-area">
      <div className="cr-login-form-heading"><span className="cr-badge">Administrator access</span><p>Use your approved admin mobile number. Signing in does not grant administrator privileges.</p></div>
      <div className="cr-login-auth"><PhoneAuthForm returnTo={returnTo}/></div>
      <p className="cr-footnote">Access is verified by Craves. Existing session, OTP and security policies remain in effect.</p>
    </div>
  </main>;
}

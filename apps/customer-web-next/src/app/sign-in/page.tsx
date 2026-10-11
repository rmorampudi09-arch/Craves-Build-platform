import Link from "next/link";
import { redirect } from "next/navigation";
import { PhoneAuthForm } from "@/features/sign-in/components/phone-auth-form";
import { CustomerSignIn } from "@/features/sign-in/components/customer-sign-in";
import { CravesLogo } from "@/shared/components/brand/CravesLogo";
import { safeReturnPath } from "@/features/auth/lib/auth-contract";
import { safeChefReturnTo } from "@/features/chef/lib/chef-mode";
import { createHash } from "node:crypto";
import { isAdminDestination } from "@/features/admin/shell/lib/admin-navigation";
import { CUSTOMER_EARLY_ACCESS_SHA256, CUSTOMERS_LAUNCHING_SOON, CUSTOMERS_LAUNCHING_SOON_COPY } from "@/features/sign-in/lib/customer-launch";
import "@/features/admin/styles/admin-control.css";

export const metadata = {
  title: "Sign in | Craves",
  robots: { index: false, follow: false }
};

export default async function SignInPage({ searchParams }: {
  searchParams: Promise<{ returnTo?: string; access?: string; confirm?: string }>;
}) {
  const query = await searchParams;
  const destination = safeReturnPath(query.returnTo);
  const adminJourney = process.env.CRAVES_ADMIN_PORTAL === "true" || isAdminDestination(destination);
  // Never default an administrator sign-in to the public customer home page.
  const returnTo = adminJourney ? (isAdminDestination(destination) ? destination : "/admin") : destination;
  // The admin portal signs in with Firebase phone auth; only hosts with the central MSG91 OTP use it.
  const centralOtp = process.env.CRAVES_CENTRAL_OTP_ENABLED === "true";
  // Chef Mode has its own sign-in, so a chef return path never needs a second OTP.
  const pathname = returnTo.split(/[?#]/, 1)[0];
  if (!adminJourney && (pathname === "/chef" || pathname.startsWith("/chef/")))
    redirect(`/chef/sign-in?returnTo=${encodeURIComponent(safeChefReturnTo(returnTo) ?? "/chef")}`);
  // Customer launch lock: only the private early-access link opens the customer sign-in (see customer-launch.ts).
  const earlyAccess = typeof query.access === "string" && createHash("sha256").update(query.access).digest("hex") === CUSTOMER_EARLY_ACCESS_SHA256;
  if (!adminJourney && CUSTOMERS_LAUNCHING_SOON && !earlyAccess) return <main className="flex min-h-screen items-center bg-[#F1F3F5] px-5 py-12"><div className="mx-auto w-full max-w-xl">
    <section role="status" className="w-full rounded-3xl border border-[#E5E7EB] bg-white p-6 text-[#1A1A1A] shadow-[0_8px_30px_rgba(0,0,0,0.08)] sm:p-8">
      <Link href="/" aria-label="Craves home"><CravesLogo size="lg" priority/></Link>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">{CUSTOMERS_LAUNCHING_SOON_COPY.title}</h1>
      <p className="mt-3 text-sm leading-6 text-[#6B6B6B]">{CUSTOMERS_LAUNCHING_SOON_COPY.body}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/chef/sign-in" className="inline-flex min-h-12 items-center rounded-full bg-[#F62E18] px-6 text-sm font-semibold text-white">{CUSTOMERS_LAUNCHING_SOON_COPY.chef}</Link>
        <Link href="/" className="inline-flex min-h-12 items-center rounded-full border border-[#E5E7EB] px-6 text-sm font-semibold">Back to Craves</Link>
      </div>
    </section>
  </div></main>;
  // confirm=customer: a chef switching to the customer app confirms with an OTP first.
  if (!adminJourney) return <main className="flex min-h-screen items-center bg-[#F1F3F5] px-5 py-12"><div className="mx-auto w-full max-w-xl"><CustomerSignIn returnTo={returnTo} centralOtp={centralOtp} confirm={query.confirm === "customer"}/></div></main>;

  return <main className="cr-admin cr-login">
    <section className="cr-login-story" aria-labelledby="cr-login-title">
      <div className="cr-brand"><Link href="/" aria-label="Craves home"><CravesLogo size="lg" priority/></Link><span><strong>Craves</strong><small>ADMINISTRATION</small></span></div>
      <div><p className="cr-eyebrow">Made for the people behind every meal</p><h2 id="cr-login-title">One workspace.<br/>Everyday control.</h2><p>Care for your customers. Support your home chefs. Keep orders, delivery and finance moving together.</p></div>
      <div className="cr-login-features"><span>Orders & delivery</span><span>People & kitchens</span><span>Finance & subscriptions</span><span>Recovery & learning</span></div>
      <p className="cr-login-quote">Different kitchens. Different recipes.<br/><strong>One feeling — home.</strong></p>
    </section>
    <div className="cr-login-form-area">
      <div className="cr-login-form-heading"><span className="cr-badge">Administrator access</span><p>Use your approved admin mobile number. Signing in does not grant administrator privileges.</p></div>
      <div className="cr-login-auth"><PhoneAuthForm returnTo={returnTo} centralOtp={centralOtp}/></div>
      <p className="cr-footnote">Access is verified by Craves. Existing session, OTP and security policies remain in effect.</p>
    </div>
  </main>;
}

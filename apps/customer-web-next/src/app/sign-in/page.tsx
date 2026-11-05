import Link from "next/link";
import { redirect } from "next/navigation";
import { PhoneAuthForm } from "@/features/sign-in/components/phone-auth-form";
import { CustomerSignIn } from "@/features/sign-in/components/customer-sign-in";
import { CravesLogo } from "@/shared/components/brand/CravesLogo";
import { safeReturnPath } from "@/features/auth/lib/auth-contract";
import { safeChefReturnTo } from "@/features/chef/lib/chef-mode";
import { createHash } from "node:crypto";
import { isAdminDestination } from "@/features/admin/shell/lib/admin-navigation";
import { CUSTOMER_EARLY_ACCESS_SHA256, CUSTOMERS_LAUNCHING_SOON, opensSignInDuringLaunch } from "@/features/sign-in/lib/customer-launch";
import { LaunchingSoonNote } from "./launching-soon-note";
import "@/features/admin/styles/admin-control.css";

export const metadata = {
  title: "Sign in | Craves",
  robots: { index: false, follow: false }
};

export default async function SignInPage({ searchParams }: {
  searchParams: Promise<{ returnTo?: string; access?: string; confirm?: string; from?: string; method?: string }>;
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
  // Customer launch lock: only the private early-access link opens the customer sign-in (see customer-launch.ts),
  // except the way back to the delete page, where earlyAccess stays false so the device is not remembered.
  const earlyAccess = typeof query.access === "string" && createHash("sha256").update(query.access).digest("hex") === CUSTOMER_EARLY_ACCESS_SHA256;
  if (!adminJourney && CUSTOMERS_LAUNCHING_SOON && !earlyAccess && !opensSignInDuringLaunch(returnTo)) return <main className="flex min-h-screen items-center bg-[#F1F3F5] px-5 py-12"><div className="mx-auto w-full max-w-xl">
    <LaunchingSoonNote fromChef={query.from === "chef"}/>
  </div></main>;
  // confirm=customer: a chef switching to the customer app confirms with an OTP first.
  if (!adminJourney) return <main className="flex min-h-screen items-center bg-[#F1F3F5] px-5 py-12"><div className="mx-auto w-full max-w-xl"><CustomerSignIn returnTo={returnTo} centralOtp={centralOtp} confirm={query.confirm === "customer"} earlyAccess={earlyAccess} email={query.method === "email"}/></div></main>;

  return <main className="cr-admin cr-login">
    <section className="cr-login-story" aria-labelledby="cr-login-title">
      <div className="cr-brand"><Link href="/" aria-label="Craves home"><CravesLogo size="lg" priority/></Link><span><strong>Craves</strong><small>ADMINISTRATION</small></span></div>
      <div><p className="cr-eyebrow">Made for the people behind every meal</p><h2 id="cr-login-title">One workspace.<br/>Everyday control.</h2><p>Care for your customers. Support your home chefs. Keep orders, delivery and finance moving together.</p></div>
      <div className="cr-login-features"><span>Orders & delivery</span><span>People & kitchens</span><span>Finance & subscriptions</span><span>Recovery & learning</span></div>
      <p className="cr-login-quote">Different kitchens. Different recipes.<br/><strong>One feeling — home.</strong></p>
    </section>
    <div className="cr-login-form-area">
      <div className="cr-login-form-heading"><span className="cr-badge">Administrator access</span><p>Use your approved admin mobile number. Signing in does not grant administrator privileges.</p></div>
      <div className="cr-login-auth"><PhoneAuthForm returnTo={returnTo} centralOtp={centralOtp} anyCountry/></div>
      <p className="cr-footnote">Access is verified by Craves. Existing session, OTP and security policies remain in effect.</p>
    </div>
  </main>;
}

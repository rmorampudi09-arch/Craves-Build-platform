"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { getSession, loadSession, subscribeSession } from "@/features/auth/api/cravesAuth";
import { useCustomerSignOut } from "@/features/profile/components/SignOutFlow";
import { CUSTOMERS_LAUNCHING_SOON_COPY } from "@/features/sign-in/lib/customer-launch";
import { CravesLogo } from "@/shared/components/brand/CravesLogo";

const secondaryAction = "inline-flex min-h-12 items-center rounded-full border border-[#E5E7EB] px-6 text-sm font-semibold";

/**
 * The customer launch lock's note (customer-launch.ts). "/" sends a signed-in person on to /home (proxy.ts,
 * LandingPage) and so back here, so they get Sign out instead of Back to Craves, and the logo opens the
 * account deletion explainer instead of the customer home.
 */
export function LaunchingSoonNote({ fromChef }: { fromChef: boolean }) {
  const user = useSyncExternalStore(subscribeSession, getSession, () => null);
  useEffect(() => {
    if (!getSession()) void loadSession().catch(() => null);
  }, []);
  return (
    <section role="status" className="w-full rounded-3xl border border-[#E5E7EB] bg-white p-6 text-[#1A1A1A] shadow-[0_8px_30px_rgba(0,0,0,0.08)] sm:p-8">
      {user
        ? <Link href="/account-deletion" aria-label="Delete your Craves account"><CravesLogo size="lg" priority/></Link>
        : <Link href="/" aria-label="Craves home"><CravesLogo size="lg" priority/></Link>}
      <h1 className="mt-6 text-3xl font-bold tracking-tight">{CUSTOMERS_LAUNCHING_SOON_COPY.title}</h1>
      <p className="mt-3 text-sm leading-6 text-[#6B6B6B]">{CUSTOMERS_LAUNCHING_SOON_COPY.body}</p>
      <Image
        src="/landing-v20/images/rider-delivery.png"
        alt="Crayon drawing of a smiling Craves rider on a red motorbike, carrying a red Craves delivery box through the city"
        width={1448}
        height={1086}
        sizes="320px"
        preload
        className="mx-auto mt-6 h-auto w-full max-w-[320px]"
      />
      <div className="mt-6 flex flex-wrap gap-3">{fromChef
        ? <Link href="/chef" className="inline-flex min-h-12 items-center rounded-full bg-[#F62E18] px-6 text-sm font-semibold text-white">{CUSTOMERS_LAUNCHING_SOON_COPY.backToKitchen}</Link>
        : <>
        <Link href="/chef/sign-in" className="inline-flex min-h-12 items-center rounded-full bg-[#F62E18] px-6 text-sm font-semibold text-white">{CUSTOMERS_LAUNCHING_SOON_COPY.chef}</Link>
        {user ? <SignOut/> : <Link href="/" className={secondaryAction}>Back to Craves</Link>}
      </>}</div>
    </section>
  );
}

// Its own component: the sign-out flow needs the App Router, which only a signed-in person's note mounts.
function SignOut() {
  const signOut = useCustomerSignOut();
  return <>
    <button type="button" onClick={signOut.ask} className={secondaryAction}>Sign out</button>
    {signOut.dialog}
  </>;
}

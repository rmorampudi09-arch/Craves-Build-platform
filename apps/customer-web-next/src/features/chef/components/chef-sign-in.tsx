"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CravesLogo } from "@/shared/components/brand/CravesLogo";
import { PhoneAuthForm } from "@/features/sign-in/components/phone-auth-form";
import type { CravesIdentity } from "@/features/auth/lib/auth-contract";
import { parseChefApplication } from "@/features/chef-onboarding/lib/chef-application-contract";
import { primeChefAccess } from "@/features/chef/components/chef-access-boundary";
import {
  enterChefMode,
  isChefModeVerified,
  markChefModeVerified,
  resolveChefDestination,
} from "@/features/chef/lib/chef-mode";
import {
  isSessionReady,
  loadSession,
  setSessionIdentity,
  synchronizeSessionRoles,
  type CravesUser,
} from "@/features/auth/api/cravesAuth";

function hasChefRole(roles: readonly string[]) {
  return roles.some((role) => role.toUpperCase() === "CHEF");
}

/** Opens the right chef screen in place; replace() keeps the sign-in page out of browser history. */
async function openChefMode(user: CravesUser, returnTo: string | null, router: ReturnType<typeof useRouter>) {
  let roles = user.roles;
  let status: string | null = null;
  try {
    const response = await fetch("/api/chef/application", {
      cache: "no-store",
      credentials: "same-origin",
      signal: AbortSignal.timeout(15_000),
    });
    status = response.ok ? (parseChefApplication(await response.json())?.status ?? null) : null;
    // A session only learns new roles from a new token: an approval after the last sign-in needs one refresh.
    if (status === "APPROVED" && !hasChefRole(roles))
      roles = (await synchronizeSessionRoles())?.roles ?? roles;
  } catch {
    // The chef page checks access again and offers a retry.
  }
  const destination = status
    ? resolveChefDestination({ roles, applicationStatus: status, returnTo })
    : (returnTo ?? "/chef");
  // Access is confirmed right here, so the kitchen opens without checking it again.
  if (status === "APPROVED" && hasChefRole(roles)) primeChefAccess(user.id);
  try {
    router.replace(destination);
  } catch {
    window.location.replace(destination);
  }
}

type View = { phase: "checking" | "form" | "opening"; user: CravesUser | null };

export function ChefSignIn({
  returnTo,
  centralOtp,
  email = false,
}: {
  returnTo: string | null;
  centralOtp: boolean;
  /** Opens on email & password (the landing popup's link). */
  email?: boolean;
}) {
  const router = useRouter();
  const navigation = useRef(router);
  useEffect(() => {
    navigation.current = router;
  }, [router]);
  const [view, setView] = useState<View>({ phase: "checking", user: null });

  useEffect(() => {
    let active = true;
    void loadSession({ hydrateCustomerProfile: "background", failFastUnauthenticated: true })
      .catch(() => null)
      .then((user) => {
        if (!active) return;
        const current = user && isSessionReady() ? user : null;
        // This device already confirmed Chef Mode for this account: no second OTP.
        if (current && isChefModeVerified(current.id)) {
          enterChefMode(current.id);
          setView({ phase: "opening", user: current });
          void openChefMode(current, returnTo, navigation.current);
        } else setView({ phase: "form", user: current });
      });
    return () => {
      active = false;
    };
  }, [returnTo]);

  async function signedIn(identity: CravesIdentity) {
    const user = setSessionIdentity(identity);
    if (!isSessionReady())
      throw new Error("This account can’t open Chef Mode. Contact Craves support for help.");
    markChefModeVerified(user.id);
    await openChefMode(user, returnTo, navigation.current);
  }

  return (
    <main className="chef-sign-in min-h-dvh bg-[#F1F3F5] lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(28rem,1fr)]">
      {/* A home kitchen at work: the whole illustration shows on white paper; the words stay short and in ink. */}
      <section className="relative flex flex-col overflow-hidden bg-white lg:sticky lg:top-0 lg:h-dvh">
        <div className="relative h-[15.5rem] sm:h-72 lg:mx-10 lg:mt-24 lg:h-auto lg:min-h-0 lg:flex-1 xl:mx-14">
          <Image
            src="/landing-v20/images/story-grid/pack-delivery.png"
            alt="Illustration of a home chef packing freshly cooked meals into containers and a Craves bag"
            fill
            preload
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-contain object-top lg:object-center"
          />
        </div>
        <Link
          href="/chef"
          className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-white/95 py-1.5 pl-1.5 pr-3.5 text-[#1A1A1A] shadow-[0_6px_20px_rgba(26,26,26,0.16)] sm:left-6 sm:top-6"
        >
          <CravesLogo size="sm" priority />
          <span className="text-sm font-bold">
            Craves <span className="font-semibold text-[#6B6B6B]">for Chefs</span>
          </span>
        </Link>
        <div className="hidden px-10 pb-12 pt-6 text-[#1A1A1A] lg:block xl:px-14 xl:pb-14">
          <p className="max-w-[18ch] font-display text-[2.6rem] font-bold leading-[1.08] tracking-[-0.03em] [text-wrap:balance]">
            Cook at home. Craves brings the orders.
          </p>
          <ul className="mt-5 flex flex-wrap gap-x-7 gap-y-2 text-[0.9375rem] font-semibold text-[#6B6B6B]">
            <li>Your menu, your prices</li>
            <li>Orders ring on your phone</li>
            <li>Earnings paid to your bank</li>
          </ul>
        </div>
      </section>

      <div className="relative z-10 -mt-8 px-4 pb-10 sm:-mt-10 lg:mt-0 lg:flex lg:items-center lg:justify-center lg:px-12 lg:py-12">
        <div className="mx-auto w-full max-w-md">
          {view.phase === "form" ? (
            <PhoneAuthForm
              returnTo={returnTo ?? "/chef"}
              centralOtp={centralOtp}
              initialPhone={view.user?.phoneNumber}
              onSignedIn={signedIn}
              email={email}
            />
          ) : (
            <section
              aria-busy="true"
              className="w-full rounded-3xl border border-[#E5E7EB] bg-white p-6 text-[#1A1A1A] sm:p-8"
            >
              <h1 className="text-3xl font-bold tracking-tight">Sign in to your kitchen</h1>
              <p role="status" className="mt-4 flex items-center gap-3 text-sm text-[#6B6B6B]">
                <span
                  className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#E5E7EB] border-t-[#F62E18] motion-reduce:animate-none"
                  aria-hidden="true"
                />
                {view.phase === "opening" ? "Opening your kitchen…" : "Checking your sign-in…"}
              </p>
            </section>
          )}
          <div className="mt-5 grid gap-1 text-center text-sm font-semibold">
            <Link
              href="/chef/application"
              className="inline-flex min-h-12 items-center justify-center rounded-full text-[#C4200F] underline-offset-4 hover:underline"
            >
              New here? Apply to cook on Craves
            </Link>
            <Link
              href="/home"
              className="inline-flex min-h-12 items-center justify-center rounded-full text-[#1A1A1A] underline-offset-4 hover:underline"
            >
              Back to Craves
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

export default ChefSignIn;

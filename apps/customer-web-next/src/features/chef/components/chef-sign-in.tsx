"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CravesLogo } from "@/shared/components/brand/CravesLogo";
import { PhoneAuthForm } from "@/features/sign-in/components/phone-auth-form";
import type { CravesIdentity } from "@/features/auth/lib/auth-contract";
import { parseChefApplication } from "@/features/chef-onboarding/lib/chef-application-contract";
import {
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

/** Opens the right chef screen; replace() keeps the sign-in page out of browser history. */
async function openChefMode(user: CravesUser, returnTo: string | null) {
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
  window.location.replace(
    status
      ? resolveChefDestination({ roles, applicationStatus: status, returnTo })
      : (returnTo ?? "/chef"),
  );
}

type View = { phase: "checking" | "form" | "opening"; user: CravesUser | null };

export function ChefSignIn({
  returnTo,
  centralOtp,
}: {
  returnTo: string | null;
  centralOtp: boolean;
}) {
  const [view, setView] = useState<View>({ phase: "checking", user: null });

  useEffect(() => {
    let active = true;
    void loadSession({ hydrateCustomerProfile: "background", failFastUnauthenticated: true })
      .catch(() => null)
      .then((user) => {
        if (!active) return;
        const current = user && isSessionReady() ? user : null;
        // This tab already confirmed Chef Mode (for example in the landing Home Chef sign-in).
        if (current && isChefModeVerified(current.id)) {
          setView({ phase: "opening", user: current });
          void openChefMode(current, returnTo);
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
    await openChefMode(user, returnTo);
  }

  return (
    <main className="chef-sign-in min-h-dvh bg-[#F1F3F5] lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(28rem,1fr)]">
      {/* A home kitchen at work: the photo carries the page; the words stay short. */}
      <section className="relative h-60 overflow-hidden sm:h-72 lg:sticky lg:top-0 lg:h-dvh">
        <img
          src="/chef/chef-welcome.webp"
          alt="A home chef stirring dal in her kitchen while a child watches"
          className="h-full w-full object-cover object-[60%_30%]"
          fetchPriority="high"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(to_top,rgba(26,26,26,0.72),rgba(26,26,26,0.12)_45%,rgba(26,26,26,0)_70%)]"
        />
        <Link
          href="/chef"
          className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-white/95 py-1.5 pl-1.5 pr-3.5 text-[#1A1A1A] shadow-[0_6px_20px_rgba(26,26,26,0.16)] sm:left-6 sm:top-6"
        >
          <CravesLogo size="sm" priority />
          <span className="text-sm font-bold">
            Craves <span className="font-semibold text-[#6B6B6B]">for Chefs</span>
          </span>
        </Link>
        <div className="absolute inset-x-0 bottom-0 hidden p-10 text-white lg:block xl:p-14">
          <p className="max-w-[16ch] font-display text-[2.6rem] font-bold leading-[1.08] tracking-[-0.03em] [text-wrap:balance]">
            Cook at home. Craves brings the orders.
          </p>
          <ul className="mt-6 flex flex-wrap gap-x-7 gap-y-2 text-[0.9375rem] font-semibold text-white/90">
            <li>Your menu, your prices</li>
            <li>Orders ring on your phone</li>
            <li>Earnings paid to your bank</li>
          </ul>
        </div>
      </section>

      <div className="relative z-10 -mt-10 px-4 pb-10 sm:-mt-14 lg:mt-0 lg:flex lg:items-center lg:justify-center lg:px-12 lg:py-12">
        <div className="mx-auto w-full max-w-md">
          {view.phase === "form" ? (
            <PhoneAuthForm
              returnTo={returnTo ?? "/chef"}
              centralOtp={centralOtp}
              initialPhone={view.user?.phoneNumber}
              onSignedIn={signedIn}
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

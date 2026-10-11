"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CravesLogo } from "@/components/brand/CravesLogo";
import { PhoneAuthForm } from "@/components/phone-auth-form";
import type { CravesIdentity } from "@/lib/auth-contract";
import { parseChefApplication } from "@/lib/chef-application-contract";
import { isChefModeVerified, markChefModeVerified, resolveChefDestination } from "@/lib/chef-mode";
import {
  isSessionReady,
  loadSession,
  setSessionIdentity,
  synchronizeSessionRoles,
  type CravesUser,
} from "@/services/auth/cravesAuth";

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
    if (status === "APPROVED" && !hasChefRole(roles)) roles = (await synchronizeSessionRoles())?.roles ?? roles;
  } catch {
    // The chef page checks access again and offers a retry.
  }
  window.location.replace(
    status ? resolveChefDestination({ roles, applicationStatus: status, returnTo }) : (returnTo ?? "/chef"),
  );
}

type View = { phase: "checking" | "form" | "opening"; user: CravesUser | null };

export function ChefSignIn({ returnTo, centralOtp }: { returnTo: string | null; centralOtp: boolean }) {
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
    if (!isSessionReady()) throw new Error("This account can’t open Chef Mode. Contact Craves support for help.");
    markChefModeVerified(user.id);
    await openChefMode(user, returnTo);
  }

  return (
    <main className="chef-sign-in min-h-dvh bg-[#F1F3F5] px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-md flex-col justify-center">
        <div className="mb-5 flex items-center gap-3">
          <CravesLogo size="md" priority />
          <span className="leading-tight">
            <span className="block text-lg font-bold text-[#1A1A1A]">Craves</span>
            <span className="block text-sm font-semibold text-[#6B6B6B]">for Chefs</span>
          </span>
        </div>
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
              <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#E5E7EB] border-t-[#F62E18] motion-reduce:animate-none" aria-hidden="true" />
              {view.phase === "opening" ? "Opening your kitchen…" : "Checking your sign-in…"}
            </p>
          </section>
        )}
        <div className="mt-6 grid gap-1 text-center text-sm font-semibold">
          <Link href="/chef/application" className="inline-flex min-h-12 items-center justify-center text-[#C4200F]">
            New here? Apply to cook on Craves
          </Link>
          <Link href="/home" className="inline-flex min-h-12 items-center justify-center text-[#1A1A1A]">
            Back to Craves
          </Link>
        </div>
      </div>
    </main>
  );
}

export default ChefSignIn;

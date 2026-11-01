"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { getSession, loadSession, subscribeSession } from "@/features/auth/api/cravesAuth";
import { PhoneAuthForm } from "@/features/sign-in/components/phone-auth-form";
import { rememberEarlyAccess } from "@/features/sign-in/lib/customer-launch";

/**
 * Customer sign-in. With confirm, a chef switching over from Chef Mode confirms with an OTP to
 * the number they are signed in with: Chef Mode and the customer app each ask for their own.
 * earlyAccess: opened from the private early-access link, which this device then remembers (customer-launch.ts).
 */
export function CustomerSignIn({ returnTo, centralOtp, confirm, earlyAccess, email = false }: { returnTo: string; centralOtp: boolean; confirm: boolean; earlyAccess: boolean; email?: boolean }) {
  const user = useSyncExternalStore(subscribeSession, getSession, () => null);
  useEffect(() => {
    if (confirm) void loadSession({ hydrateCustomerProfile: "background" }).catch(() => null);
  }, [confirm]);
  useEffect(() => {
    if (earlyAccess) rememberEarlyAccess();
  }, [earlyAccess]);
  const phone = confirm ? user?.phoneNumber : undefined;
  return (
    <>
      <PhoneAuthForm
        // The number arrives with the session; a new key starts the form with it filled in.
        key={phone ?? "phone"}
        returnTo={returnTo}
        centralOtp={centralOtp}
        initialPhone={phone}
        email={email}
        heading={confirm ? { title: "Switch to the customer app", text: "Confirm it’s you with a code sent to this number." } : undefined}
      />
      {confirm ? (
        <Link href="/chef" className="mt-4 flex min-h-12 items-center justify-center text-sm font-semibold text-[#1A1A1A] hover:underline">
          Back to Chef Mode
        </Link>
      ) : null}
    </>
  );
}

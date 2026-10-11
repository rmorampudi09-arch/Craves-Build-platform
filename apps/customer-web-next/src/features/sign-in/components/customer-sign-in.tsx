"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getSession, loadSession, subscribeSession } from "@/features/auth/api/cravesAuth";
import { PhoneAuthForm } from "@/features/sign-in/components/phone-auth-form";

/**
 * Customer sign-in. With confirm, a chef switching over from Chef Mode confirms with an OTP to
 * the number they are signed in with: Chef Mode and the customer app each ask for their own.
 */
export function CustomerSignIn({ returnTo, centralOtp, confirm }: { returnTo: string; centralOtp: boolean; confirm: boolean }) {
  const user = useSyncExternalStore(subscribeSession, getSession, () => null);
  useEffect(() => {
    if (confirm) void loadSession({ hydrateCustomerProfile: "background" }).catch(() => null);
  }, [confirm]);
  const phone = confirm ? user?.phoneNumber : undefined;
  return (
    <PhoneAuthForm
      // The number arrives with the session; a new key starts the form with it filled in.
      key={phone ?? "phone"}
      returnTo={returnTo}
      centralOtp={centralOtp}
      initialPhone={phone}
      heading={
        confirm
          ? {
              title: "Switch to the customer app",
              text: "Confirm it’s you with a code to your phone. Chef Mode and the customer app each ask once, so neither can open the other on its own.",
            }
          : undefined
      }
    />
  );
}

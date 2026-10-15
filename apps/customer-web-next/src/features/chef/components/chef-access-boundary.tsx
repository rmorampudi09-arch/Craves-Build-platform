"use client";

import { CHEF_ERROR_MESSAGES, chefApiError, ChefError, chefErrorText } from "@/features/chef/lib/chef-errors";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { parseChefApplication } from "@/features/chef-onboarding/lib/chef-application-contract";
import { enterChefMode, isChefModeVerified } from "@/features/chef/lib/chef-mode";
import { rememberChefName } from "@/features/chef/lib/chef-name";
import { ChefLoading, chefLoadingShapeFor } from "@/features/chef/components/chef-loading";
import { ChefAvatarGate } from "@/features/chef/components/chef-avatar";
import { Fragment, type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  AuthenticationRequiredError,
  captureSessionContext,
  getSession,
  isSessionContextCurrent,
  isSessionReady,
  loadSession,
  subscribeSession,
  synchronizeSessionRoles,
  type CravesUser,
} from "@/features/auth/api/cravesAuth";

const ACCESS_UNAVAILABLE = "Check your connection and try again.";
const ROLE_PENDING =
  "Your kitchen is approved, but Craves hasn’t switched on your chef access yet. Try again in a minute. If it stays, contact Craves support — it’s on our side, and you don’t need to sign in again.";
const READY_FOR_MS = 5 * 60_000;
type AccessState = "checking" | "ready" | "unavailable";

// One confirmed result per session: switching chef tabs renders at once instead of re-checking access.
let confirmed: { userId: string; generation: number; at: number } | null = null;

/** /chef/sign-in just confirmed an approved chef: the first chef page opens without checking again. */
export function primeChefAccess(userId: string): void {
  confirmed = { userId, generation: captureSessionContext().generation, at: Date.now() };
}

function hasChefRole(user: CravesUser | null): boolean {
  return Boolean(
    user?.status === "ACTIVE" && user.roles.some((role) => role.toUpperCase() === "CHEF"),
  );
}

function recentlyConfirmed(user: CravesUser | null): boolean {
  return Boolean(
    user &&
      confirmed?.userId === user.id &&
      confirmed.generation === captureSessionContext().generation &&
      Date.now() - confirmed.at < READY_FOR_MS &&
      isSessionReady() &&
      hasChefRole(user) &&
      isChefModeVerified(user.id),
  );
}

function accessScope(): string {
  const context = captureSessionContext();
  return JSON.stringify([
    context.generation,
    context.identityId,
    hasChefRole(getSession()),
    isSessionReady(),
  ]);
}
const serverScope = () => "server";

/**
 * Chef workspace pages open only for an approved chef whose device (or tab) confirmed Chef Mode
 * with a phone OTP. Anyone else goes to /chef/sign-in (returning here afterwards) or to their
 * application status.
 */
export function ChefAccessBoundary({ children }: { children: ReactNode }) {
  const router = useRouter();
  const loadingShape = chefLoadingShapeFor(usePathname());
  const navigation = useRef(router);
  useEffect(() => {
    navigation.current = router;
  }, [router]);
  const scope = useSyncExternalStore(subscribeSession, accessScope, serverScope);
  const cached = scope !== "server" && recentlyConfirmed(getSession());
  const [access, setAccess] = useState<{ scope: string; state: AccessState; detail?: string }>({
    scope: "server",
    state: "checking",
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (cached) return;
    let active = true;
    const here = `${window.location.pathname}${window.location.search}`;
    const signIn = () => {
      if (active) navigation.current.replace(`/chef/sign-in?returnTo=${encodeURIComponent(here)}`);
    };
    const unavailable = (detail: string) => {
      if (active) setAccess({ scope: accessScope(), state: "unavailable", detail });
    };

    void (async () => {
      const initial = captureSessionContext();
      const current = await loadSession({ failFastUnauthenticated: true, hydrateCustomerProfile: "background" });
      if (!active) return;
      // Initial /me may establish an owner. An existing owner's logout or
      // replacement invalidates all work started under that session generation.
      if (initial.identityId !== null && !isSessionContextCurrent(initial)) return;
      if (!current) {
        if (!getSession()) return signIn();
        // A held identity is either a sign-out still settling (it navigates on its own) or Auth being unreachable.
        return isSessionReady() ? unavailable(ACCESS_UNAVAILABLE) : undefined;
      }
      if (getSession()?.id !== current.id) return;
      if (!isSessionReady() || !isChefModeVerified(current.id)) return signIn();

      const context = captureSessionContext();
      const response = await fetch("/api/chef/application", {
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      const application = response.ok ? parseChefApplication(await response.json()) : null;
      const failureBody: unknown = response.ok ? null : await response.json().catch(() => null);
      if (!active || !isSessionContextCurrent(context)) return;
      if (response.status === 401) return signIn();
      if (application) rememberChefName(current.id, application);
      if (!application)
        return unavailable(chefErrorText(response.ok
          ? new ChefError(CHEF_ERROR_MESSAGES.UNEXPECTED_RESPONSE, "INVALID_CHEF_APPLICATION_RESPONSE", response.status)
          : chefApiError(response, failureBody, ACCESS_UNAVAILABLE), ACCESS_UNAVAILABLE));
      if (application.status !== "APPROVED") {
        navigation.current.replace("/chef/application/status");
        return;
      }

      let chef = current;
      if (!hasChefRole(current)) {
        // Auth /me only reports roles the current token carries; a refresh re-reads them, so an
        // application approved after the last sign-in needs exactly one rotation.
        const synchronized = await synchronizeSessionRoles();
        if (!active || getSession()?.id !== current.id) return;
        if (!synchronized) return unavailable(ACCESS_UNAVAILABLE);
        // A new OTP would read the same roles: say so, and never loop between /chef and the status page.
        if (!hasChefRole(synchronized)) return unavailable(ROLE_PENDING);
        chef = synchronized;
      }
      primeChefAccess(chef.id);
      // This tab joins Chef Mode, and the device's 30 days start again.
      enterChefMode(chef.id);
      setAccess({ scope: accessScope(), state: "ready" });
    })().catch((error: unknown) => {
      if (!active) return;
      if (error instanceof AuthenticationRequiredError) signIn();
      else unavailable(chefErrorText(error, ACCESS_UNAVAILABLE));
    });

    return () => {
      active = false;
    };
  }, [scope, attempt, cached]);

  const state = cached ? "ready" : access.scope === scope ? access.state : "checking";
  if (state === "ready" && isSessionReady() && hasChefRole(getSession())) {
    // Reset private forms and request receipts on owner/session changes, while
    // preserving local work during healthy same-owner email/profile updates.
    return <Fragment key={scope}><ChefAvatarGate>{children}</ChefAvatarGate></Fragment>;
  }

  if (state === "unavailable") {
    const rolePending = access.detail === ROLE_PENDING;
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 text-[#1A1A1A] md:p-8">
        <h2 className="text-2xl font-bold">{rolePending ? "Your chef access is on its way" : "We couldn’t reach Craves"}</h2>
        <p role="alert" className="mt-2 text-sm leading-6 text-[#6B6B6B]">
          {access.detail || ACCESS_UNAVAILABLE}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="craves-primary-action w-full sm:w-auto"
            onClick={() => {
              setAccess({ scope, state: "checking" });
              setAttempt((value) => value + 1);
            }}
          >
            Try again
          </button>
          {rolePending ? (
            // Chef support sits behind this same check; the open contact page always works.
            <Link
              href="/contact"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-[#E5E7EB] px-6 text-sm font-semibold text-[#1A1A1A] sm:w-auto"
            >
              Contact support
            </Link>
          ) : null}
        </div>
      </section>
    );
  }

  return <ChefLoading shape={loadingShape} label="Opening Chef Mode" head={loadingShape !== "chat"} />;
}

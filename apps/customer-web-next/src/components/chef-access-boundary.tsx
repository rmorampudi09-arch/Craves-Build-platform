"use client";

import Link from "next/link";
import { Fragment, type ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import {
  captureSessionContext,
  getSession,
  isSessionContextCurrent,
  isSessionReady,
  loadSession,
  subscribeSession,
  synchronizeSessionRoles,
  type CravesUser,
} from "@/services/auth/cravesAuth";

type AccessState = "synchronizing" | "ready" | "sign-in" | "not-approved" | "unavailable";

function hasChefRole(user: CravesUser | null): boolean {
  return Boolean(user?.status === "ACTIVE" && user.roles.some((role) => role.toUpperCase() === "CHEF"));
}

function accessScope(): string {
  const context = captureSessionContext();
  return JSON.stringify([context.generation, context.identityId, hasChefRole(getSession()), isSessionReady()]);
}
const serverScope = () => "server";

export function ChefAccessBoundary({ children }: { children: ReactNode }) {
  const scope = useSyncExternalStore(subscribeSession, accessScope, serverScope);
  const [access, setAccess] = useState<{ scope: string; state: AccessState }>({ scope: "server", state: "synchronizing" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(() => {
      if (active) { active = false; setAccess({ scope, state: "unavailable" }); }
    }, 15_000);

    void (async () => {
      const initial = captureSessionContext();
      const current = await loadSession({ hydrateCustomerProfile: "skip" });
      if (!active) return;
      // Initial /me may establish an owner. An existing owner's logout or
      // replacement invalidates all work started under that session generation.
      if (initial.identityId !== null && !isSessionContextCurrent(initial)) return;
      if (!current) {
        setAccess({ scope: accessScope(), state: isSessionReady() ? "unavailable" : "sign-in" });
        return;
      }
      if (getSession()?.id !== current.id) return;
      if (!isSessionReady()) {
        setAccess({ scope: accessScope(), state: "sign-in" });
        return;
      }

      if (!hasChefRole(current)) {
        setAccess({ scope: accessScope(), state: "not-approved" });
        return;
      }

      // Auth /me reads the current database roles. Rotate the HTTP-only token
      // before calling Catalog or Order so its signed JWT carries CHEF too.
      const established = captureSessionContext();
      const synchronized = await synchronizeSessionRoles({ hydrateCustomerProfile: "skip" });
      if (!active || !isSessionContextCurrent(established) || getSession()?.id !== current.id) return;
      setAccess({ scope: accessScope(), state: !synchronized ? "unavailable" : isSessionReady() && synchronized.id === current.id && hasChefRole(synchronized) ? "ready" : "not-approved" });
    })().catch(() => {
      if (active) setAccess({ scope, state: "unavailable" });
    }).finally(() => window.clearTimeout(timeout));

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [scope, attempt]);

  const state = access.scope === scope ? access.state : "synchronizing";
  if (state === "ready" && isSessionReady() && hasChefRole(getSession())) {
    // Reset private forms and request receipts on owner/session changes, while
    // preserving local work during healthy same-owner email/profile updates.
    return <Fragment key={scope}>{children}</Fragment>;
  }

  return (
    <section className="rounded-[30px] border border-border bg-white p-7 text-slate-950">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#6930CA]">
        Secure chef access
      </p>
      <h2 className="mt-3 text-2xl font-bold">
        {state === "synchronizing"
          ? "Synchronizing your approved chef role…"
          : state === "not-approved"
            ? "Chef approval is still required"
            : state === "unavailable"
              ? "We couldn’t check your chef access"
            : "Sign in again to continue"}
      </h2>
      {state !== "synchronizing" && (
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {state === "not-approved"
            ? "You are signed in. Submit or review your chef application; Craves admin approval remains authoritative."
            : state === "unavailable"
              ? "Check your connection and try again. Your chef tools stay closed until access is confirmed."
            : "Complete mobile OTP sign-in again so Catalog and Order services receive your current roles."}
        </p>
      )}
      {state === "unavailable" ? <button type="button" className="mt-7 min-h-12 rounded-full bg-[#F62E18] px-6 font-semibold text-white" onClick={() => { setAccess({ scope, state: "synchronizing" }); setAttempt(value => value + 1); }}>Try again</button> : null}
      {state === "sign-in" ? (
        <Link
          href="/sign-in?returnTo=/chef"
          className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#F62E18] px-6 font-semibold text-white sm:w-auto"
        >
          Verify and continue
        </Link>
      ) : null}

      {state === "not-approved" ? (
        <Link
          href="/chef/application"
          className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#F62E18] px-6 font-semibold text-white sm:w-auto"
        >
          Open chef application
        </Link>
      ) : null}

      {state !== "synchronizing" ? (
        <div className="mt-3">
          <Link
            href="/home"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#F1F3F5] px-5 text-sm font-semibold text-[#1A1A1A] transition hover:bg-[#E5E7EB]"
          >
            Switch to Customer Mode
          </Link>
        </div>
      ) : null}
    </section>
  );
}

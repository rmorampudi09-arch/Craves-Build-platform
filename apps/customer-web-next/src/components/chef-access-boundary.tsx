"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseChefApplication } from "@/lib/chef-application-contract";
import { Fragment, type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
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
  return Boolean(
    user?.status === "ACTIVE" && user.roles.some((role) => role.toUpperCase() === "CHEF"),
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

export function ChefAccessBoundary({ children }: { children: ReactNode }) {
  const router = useRouter();
  const navigation = useRef(router);
  useEffect(() => {
    navigation.current = router;
  }, [router]);
  const scope = useSyncExternalStore(subscribeSession, accessScope, serverScope);
  const [access, setAccess] = useState<{ scope: string; state: AccessState }>({
    scope: "server",
    state: "synchronizing",
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    void (async () => {
      const initial = captureSessionContext();
      const current = await loadSession();
      if (!active) return;
      // Initial /me may establish an owner. An existing owner's logout or
      // replacement invalidates all work started under that session generation.
      if (initial.identityId !== null && !isSessionContextCurrent(initial)) return;
      if (!current) {
        setAccess({ scope: accessScope(), state: "sign-in" });
        return;
      }
      if (getSession()?.id !== current.id) return;
      if (!isSessionReady()) {
        setAccess({ scope: accessScope(), state: "sign-in" });
        return;
      }

      if (!hasChefRole(current)) {
        setAccess({ scope: accessScope(), state: "not-approved" });
        navigation.current.replace("/chef/application/status");
        return;
      }

      const applicationContext = captureSessionContext();
      const response = await fetch("/api/chef/application", {
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      const application = response.ok ? parseChefApplication(await response.json()) : null;
      if (!active || !isSessionContextCurrent(applicationContext)) return;
      if (!application) {
        setAccess({
          scope: accessScope(),
          state: response.status === 401 ? "sign-in" : "unavailable",
        });
        return;
      }
      if (application.status !== "APPROVED") {
        setAccess({ scope: accessScope(), state: "not-approved" });
        navigation.current.replace("/chef/application/status");
        return;
      }

      // Auth /me reads the current database roles. Rotate the HTTP-only token
      // before calling Catalog or Order so its signed JWT carries CHEF too.
      const established = captureSessionContext();
      const synchronized = await synchronizeSessionRoles();
      if (!active || !isSessionContextCurrent(established) || getSession()?.id !== current.id)
        return;
      setAccess({
        scope: accessScope(),
        state:
          isSessionReady() && synchronized?.id === current.id && hasChefRole(synchronized)
            ? "ready"
            : "sign-in",
      });
    })().catch(() => {
      if (active)
        setAccess({ scope, state: isSessionReady() ? "unavailable" : "sign-in" });
    });

    return () => {
      active = false;
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
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#C4200F]">
        Secure chef access
      </p>
      <h2 className="mt-3 text-2xl font-bold">
        {state === "synchronizing"
          ? "Checking your chef access…"
          : state === "not-approved"
            ? "Chef approval is still required"
            : state === "unavailable"
              ? "We couldn’t verify chef access"
              : "Sign in again to continue"}
      </h2>
      {state !== "synchronizing" && (
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {state === "not-approved"
            ? "You are signed in. View your application for the latest review status."
            : state === "unavailable"
              ? "Your application status is temporarily unavailable. Retry before opening chef tools."
              : "Verify your mobile number to open your chef tools."}
        </p>
      )}
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
          href="/chef/application/status"
          className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#F62E18] px-6 font-semibold text-white sm:w-auto"
        >
          View application status
        </Link>
      ) : null}
      {state === "unavailable" ? (
        <button
          type="button"
          className="mt-7 min-h-12 rounded-full bg-[#F62E18] px-6 font-semibold text-white"
          onClick={() => {
            setAccess({ scope, state: "synchronizing" });
            setAttempt((value) => value + 1);
          }}
        >
          Retry access check
        </button>
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

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

type AccessState = "synchronizing" | "ready" | "sign-in" | "not-approved";

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
        return;
      }

      // Auth /me reads the current database roles. Rotate the HTTP-only token
      // before calling Catalog or Order so its signed JWT carries CHEF too.
      const established = captureSessionContext();
      const synchronized = await synchronizeSessionRoles();
      if (!active || !isSessionContextCurrent(established) || getSession()?.id !== current.id) return;
      setAccess({ scope: accessScope(), state: isSessionReady() && synchronized?.id === current.id && hasChefRole(synchronized) ? "ready" : "sign-in" });
    })().catch(() => {
      if (active) setAccess({ scope, state: "sign-in" });
    });
    return () => {
      active = false;
    };
  }, [scope]);

  const state = access.scope === scope ? access.state : "synchronizing";
  if (state === "ready" && isSessionReady() && hasChefRole(getSession())) {
    // Reset private forms and request receipts on owner/session changes, while
    // preserving local work during healthy same-owner email/profile updates.
    return <Fragment key={scope}>{children}</Fragment>;
  }

  return (
    <section className="rounded-[30px] bg-[#FFF8EC] p-7 text-slate-950">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#6930CA]">
        Secure chef access
      </p>
      <h2 className="mt-3 text-2xl font-bold">
        {state === "synchronizing"
          ? "Synchronizing your approved chef role…"
          : state === "not-approved"
            ? "Chef approval is still required"
            : "Sign in again to continue"}
      </h2>
      {state !== "synchronizing" && (
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {state === "not-approved"
            ? "You are signed in. Submit or review your chef application; Craves admin approval remains authoritative."
            : "Complete mobile OTP sign-in again so Catalog and Order services receive your current roles."}
        </p>
      )}
      {state === "sign-in" && (
        <Link
          href="/sign-in?returnTo=/chef"
          className="mt-5 inline-flex rounded-full bg-[#6930CA] px-5 py-3 font-bold text-white"
        >
          Continue with mobile OTP
        </Link>
      )}
      {state === "not-approved" && (
        <Link
          href="/chef/application"
          className="mt-5 inline-flex rounded-full bg-[#6930CA] px-5 py-3 font-bold text-white"
        >
          Open chef application
        </Link>
      )}
    </section>
  );
}

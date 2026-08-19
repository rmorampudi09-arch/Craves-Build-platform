"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { parseChefApplication } from "@/lib/chef-application-contract";
import {
  loadSession,
  synchronizeSessionRoles,
  type CravesUser,
} from "@/services/auth/cravesAuth";

type AccessState = "synchronizing" | "ready" | "sign-in" | "not-approved";
type SignInReason = "signed-out" | "refresh-required";

function hasChefRole(user: CravesUser | null): boolean {
  return Boolean(user?.roles.some((role) => role.toUpperCase() === "CHEF"));
}

export function ChefAccessBoundary({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccessState>("synchronizing");
  const [signInReason, setSignInReason] = useState<SignInReason>("signed-out");

  useEffect(() => {
    let active = true;

    void (async () => {
      const current = await loadSession();
      if (!active) return;
      if (!current) {
        setSignInReason("signed-out");
        setState("sign-in");
        return;
      }

      if (!hasChefRole(current)) {
        const applicationResponse = await fetch("/api/chef/application", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!active) return;
        if (!applicationResponse.ok) {
          setState(applicationResponse.status === 401 ? "sign-in" : "not-approved");
          return;
        }
        const application = parseChefApplication(
          await applicationResponse.json().catch(() => null),
        );
        if (application?.status !== "APPROVED") {
          setState("not-approved");
          return;
        }
      }

      // Auth /me reads the current database roles. Rotate the HTTP-only token
      // before calling chef-owned services so its signed JWT carries CHEF too.
      const synchronized = await synchronizeSessionRoles();
      if (!active) return;
      if (hasChefRole(synchronized)) {
        setState("ready");
        return;
      }

      setSignInReason("refresh-required");
      setState("sign-in");
    })().catch(() => {
      if (!active) return;
      setSignInReason("refresh-required");
      setState("sign-in");
    });

    return () => {
      active = false;
    };
  }, []);

  if (state === "ready") return children;

  const title =
    state === "synchronizing"
      ? "Checking your Chef access…"
      : state === "not-approved"
        ? "Chef approval is still required"
        : signInReason === "refresh-required"
          ? "One quick verification"
          : "Sign in to continue";
  const description =
    state === "synchronizing"
      ? "We’re confirming your approved chef access. This usually takes a moment."
      : state === "not-approved"
        ? "Your Chef application must be approved before kitchen, menu, order, and earnings tools become available."
        : signInReason === "refresh-required"
          ? "We found your Chef access, but your secure session needs to be refreshed before you continue."
          : "Confirm your Craves mobile number to continue to Chef Mode.";

  return (
    <section className="mx-auto max-w-2xl rounded-3xl border border-[#E5E7EB] bg-white p-6 text-[#1A1A1A] shadow-[0_6px_24px_rgba(0,0,0,0.08)] md:p-9">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5]">
        <ShieldCheck className="h-7 w-7 text-[#F62E18]" aria-hidden="true" />
      </span>
      <p className="mt-5 text-sm font-semibold text-[#F62E18]">Chef Mode</p>
      <h2 className="mt-1 text-3xl font-bold tracking-tight text-[#1A1A1A]">{title}</h2>
      <p className="mt-3 max-w-xl text-sm leading-6 text-[#6B6B6B]">{description}</p>

      {state === "synchronizing" ? (
        <div className="mt-6 h-2 overflow-hidden rounded-full bg-[#F1F3F5]" aria-hidden="true">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-[#F62E18]" />
        </div>
      ) : null}

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

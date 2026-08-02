"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { synchronizeSessionRoles } from "@/services/auth/cravesAuth";

type AccessState = "synchronizing" | "ready" | "sign-in" | "not-approved";

export function ChefAccessBoundary({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccessState>("synchronizing");

  useEffect(() => {
    let active = true;
    void synchronizeSessionRoles().then((user) => {
      if (!active) return;
      if (!user) {
        setState("sign-in");
        return;
      }
      setState(
        user.roles.some((role) => role.toUpperCase() === "CHEF")
          ? "ready"
          : "not-approved",
      );
    });
    return () => {
      active = false;
    };
  }, []);

  if (state === "ready") return children;

  const approved = state !== "not-approved";
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
          {approved
            ? "The secure refresh session is unavailable. Complete OTP sign-in again so Catalog and Order services receive your current roles."
            : "Submit or review your chef application. Craves admin approval remains authoritative."}
        </p>
      )}
      {state === "sign-in" && (
        <Link
          href="/sign-in?returnTo=/chef"
          className="mt-5 inline-flex rounded-full bg-[#6930CA] px-5 py-3 font-bold text-white"
        >
          Sign in again
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

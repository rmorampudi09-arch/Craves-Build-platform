"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadSession, type CravesUser } from "@/services/auth/cravesAuth";

const approvedLinks = [
  {
    href: "/chef/kitchen",
    label: "Kitchen profile",
    description:
      "Manage the approved kitchen profile used by Catalog and Order services.",
  },
  {
    href: "/chef/menu",
    label: "Menu",
    description:
      "Create dishes, update availability and manage approved item images.",
  },
  {
    href: "/chef/orders",
    label: "Chef orders",
    description:
      "Review chef-owned orders and take supported workflow actions.",
  },
  {
    href: "/notifications",
    label: "Notifications",
    description: "Review identity-owned operational notifications.",
  },
];

type DashboardState =
  | "loading"
  | "signed-out"
  | "applicant"
  | "approved"
  | "unavailable";

function hasChefRole(user: CravesUser): boolean {
  return user.roles.some((role) => role.toUpperCase() === "CHEF");
}

export function ChefModeDashboard() {
  const [user, setUser] = useState<CravesUser | null>(null);
  const [state, setState] = useState<DashboardState>("loading");

  useEffect(() => {
    let active = true;
    void loadSession()
      .then((current) => {
        if (!active) return;
        if (!current) {
          setState("signed-out");
          return;
        }
        setUser(current);
        setState(hasChefRole(current) ? "approved" : "applicant");
      })
      .catch(() => {
        if (active) setState("unavailable");
      });
    return () => {
      active = false;
    };
  }, []);

  if (state === "loading") {
    return (
      <section className="rounded-[30px] bg-[#FFF8EC] p-7 text-slate-950">
        <p role="status">Checking your Craves chef access…</p>
      </section>
    );
  }

  if (state === "signed-out") {
    return (
      <section className="rounded-[30px] bg-[#FFF8EC] p-7 text-slate-950">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#6930CA]">
          Secure Craves access
        </p>
        <h2 className="mt-3 text-3xl font-bold">Sign in as a home chef</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Use your registered mobile number. The same Firebase identity supports
          customer and chef mode.
        </p>
        <Link
          href="/sign-in?returnTo=/chef"
          className="mt-6 inline-flex rounded-full bg-[#6930CA] px-5 py-3 font-bold text-white"
        >
          Continue with mobile OTP
        </Link>
      </section>
    );
  }

  if (state === "unavailable") {
    return (
      <section className="rounded-[30px] bg-[#FFF8EC] p-7 text-slate-950">
        <p role="status">Chef mode is temporarily unavailable. Try again.</p>
      </section>
    );
  }

  if (state === "applicant") {
    return (
      <section className="rounded-[30px] bg-[#FFF8EC] p-7 text-slate-950">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#6930CA]">
          Chef registration
        </p>
        <h2 className="mt-3 text-3xl font-bold">
          Continue your home-chef application
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          You are signed in as {user?.phoneNumber}. Submit or review the chef
          application for this same Craves account. Chef functions unlock only
          after admin approval.
        </p>
        <Link
          href="/chef/application"
          className="mt-6 inline-flex rounded-full bg-[#6930CA] px-5 py-3 font-bold text-white"
        >
          Open chef application
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="rounded-[30px] bg-[#FFF8EC] p-7 text-slate-950">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#6930CA]">
          Chef mode
        </p>
        <h2 className="mt-3 text-3xl font-bold">
          Welcome{user?.username ? `, ${user.username}` : ""}
        </h2>
        <p className="mt-3 text-sm text-slate-600">
          Your backend identity includes the CHEF role. Each service still
          validates ownership and role on every request.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {approvedLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-[24px] border border-white/10 bg-white/5 p-5 text-white transition hover:bg-white/10"
          >
            <strong>{link.label}</strong>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {link.description}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

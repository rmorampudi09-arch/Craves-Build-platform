"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ChefModeIdentity } from "@/lib/chef-mode-contract";

const approvedLinks = [
  { href: "/chef/kitchen", label: "Kitchen profile", description: "Manage the approved kitchen profile used by Catalog and Order services." },
  { href: "/chef/menu", label: "Menu", description: "Create dishes, update availability and manage approved item images." },
  { href: "/chef/orders", label: "Chef orders", description: "Review chef-owned orders and take supported workflow actions." },
  { href: "/notifications", label: "Notifications", description: "Review identity-owned operational notifications." }
];

export function ChefModeDashboard() {
  const [identity, setIdentity] = useState<ChefModeIdentity | null>(null);
  const [message, setMessage] = useState("Checking your Craves chef access…");

  useEffect(() => {
    let active = true;
    fetch("/api/chef/me", { cache: "no-store" })
      .then(async response => ({ response, body: await response.json().catch(() => null) }))
      .then(({ response, body }) => {
        if (!active) return;
        if (response.status === 401) {
          setMessage("Sign in with your registered mobile number to continue.");
          return;
        }
        if (!response.ok) {
          setMessage("Chef mode is temporarily unavailable.");
          return;
        }
        setIdentity(body as ChefModeIdentity);
        setMessage("");
      })
      .catch(() => active && setMessage("Chef mode is temporarily unavailable."));
    return () => { active = false; };
  }, []);

  if (!identity) {
    return <section className="rounded-[30px] bg-[#FFF8EC] p-7 text-slate-950"><p role="status">{message}</p><Link href="/sign-in?returnTo=/chef" className="mt-5 inline-flex rounded-full bg-[#6930CA] px-5 py-3 font-bold text-white">Sign in</Link></section>;
  }

  if (!identity.chefEnabled) {
    return <section className="rounded-[30px] bg-[#FFF8EC] p-7 text-slate-950"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#6930CA]">Chef access</p><h2 className="mt-3 text-3xl font-bold">Chef mode is not enabled yet</h2><p className="mt-3 text-sm leading-6 text-slate-600">Submit or review your chef application. Approval and compliance decisions remain with the Craves admin process.</p><Link href="/chef/application" className="mt-6 inline-flex rounded-full bg-[#6930CA] px-5 py-3 font-bold text-white">Open chef application</Link></section>;
  }

  return <section className="space-y-6"><div className="rounded-[30px] bg-[#FFF8EC] p-7 text-slate-950"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#6930CA]">Chef mode</p><h2 className="mt-3 text-3xl font-bold">Welcome{identity.displayName ? `, ${identity.displayName}` : ""}</h2><p className="mt-3 text-sm text-slate-600">Your backend identity includes the CHEF role. Each service still validates ownership and role on every request.</p></div><div className="grid gap-4 md:grid-cols-2">{approvedLinks.map(link => <Link key={link.href} href={link.href} className="rounded-[24px] border border-white/10 bg-white/5 p-5 text-white transition hover:bg-white/10"><strong>{link.label}</strong><p className="mt-2 text-sm leading-6 text-slate-300">{link.description}</p></Link>)}</div></section>;
}

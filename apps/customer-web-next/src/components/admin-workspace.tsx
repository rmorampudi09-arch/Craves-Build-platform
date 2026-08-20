"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import {
  BellRing, ChefHat, CircleUserRound, ClipboardList, Gauge, LayoutDashboard,
  Menu, ReceiptText, Search, SearchCheck, ShieldCheck, X
} from "lucide-react";
import type { AdminIdentity } from "@/lib/admin-contract";
import { SyncfusionLicense } from "@/components/syncfusion-license";
import { CravesLogo } from "@/components/brand/CravesLogo";

const navigation = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, group: "Control center" },
  { href: "/admin/search", label: "Global search", icon: Search, group: "Control center" },
  { href: "/admin/chef-reviews", label: "Chef reviews", icon: ChefHat, group: "People & kitchens" },
  { href: "/admin/operations", label: "Order investigations", icon: SearchCheck, group: "Operations" },
  { href: "/admin/subscription-plans", label: "Plans", icon: ReceiptText, group: "Subscriptions" },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: ClipboardList, group: "Subscriptions" },
  { href: "/admin/subscription-capacity", label: "Capacity", icon: Gauge, group: "Subscriptions" },
  { href: "/admin/accounts", label: "Account security", icon: ShieldCheck, group: "Trust & recovery" },
  { href: "/admin/notifications", label: "Notification recovery", icon: BellRing, group: "Trust & recovery" }
];

export function AdminWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);
  const [message, setMessage] = useState("Verifying administrator access…");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/me", { cache: "no-store" })
      .then(async response => ({ response, body: await response.json().catch(() => null) }))
      .then(({ response, body }) => {
        if (!active) return;
        if (response.status === 401) throw new Error("Sign in with an administrator account.");
        if (response.status === 403) throw new Error("This account does not have administrator access.");
        if (!response.ok) throw new Error("Administrator identity is temporarily unavailable.");
        setIdentity(body as AdminIdentity);
        setMessage("");
      })
      .catch(error => active && setMessage(error instanceof Error ? error.message : "Administrator access is unavailable."));
    return () => { active = false; };
  }, []);

  if (!identity) {
    return <main className="flex min-h-screen items-center justify-center bg-[#0b1426] px-5">
      <section className="w-full max-w-lg rounded-[32px] border border-white/10 bg-[#fff8ec] p-8 text-center shadow-[0_24px_70px_-42px_rgba(0,0,0,0.8)]">
        <CravesLogo size="lg" className="mx-auto" priority />
        <h1 className="mt-5 text-2xl font-black text-[#251b35]">Craves administration</h1>
        <p className="mt-3 text-sm text-[#71677d]" role="status">{message}</p>
        <Link href={`/sign-in?returnTo=${encodeURIComponent(pathname)}`} className="mt-6 inline-flex rounded-xl bg-[#6930ca] px-5 py-3 text-sm font-black text-white">Administrator sign in</Link>
      </section>
    </main>;
  }

  const groups = [...new Set(navigation.map(item => item.group))];

  return <div className="min-h-screen bg-[#f7f5fb] text-[#251b35]">
    <SyncfusionLicense />
    {menuOpen && <button aria-label="Close navigation overlay" className="fixed inset-0 z-40 bg-[#0b1426]/60 lg:hidden" onClick={() => setMenuOpen(false)} />}
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[292px] flex-col bg-[#0b1426] text-white shadow-2xl transition-transform lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="flex h-24 items-center justify-between border-b border-white/10 px-6">
        <Link href="/admin" className="flex items-center gap-3" onClick={() => setMenuOpen(false)}>
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#fff8ec]"><CravesLogo size="md" priority /></div>
          <span><strong className="block text-xl font-black tracking-tight">Craves</strong><small className="text-[9px] font-black uppercase tracking-[0.22em] text-[#f6b545]">Admin control</small></span>
        </Link>
        <button className="rounded-xl p-2 hover:bg-white/10 lg:hidden" onClick={() => setMenuOpen(false)} aria-label="Close navigation"><X size={20} /></button>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-5" aria-label="Administrator modules">
        {groups.map(group => <div key={group} className="mb-5"><p className="mb-2 px-3 text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">{group}</p><div className="space-y-1">{navigation.filter(item => item.group === group).map(item => {
          const selected = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} aria-current={selected ? "page" : undefined}
            className={`flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-bold transition ${selected ? "bg-[#6930ca] text-white shadow-lg shadow-black/25" : "text-slate-300 hover:bg-white/8 hover:text-white"}`}>
            <Icon size={18} strokeWidth={2.2} /><span>{item.label}</span>{item.href === "/admin/search" ? <span className="ml-auto rounded-md bg-white/10 px-1.5 py-0.5 text-[9px]">NEW</span> : null}
          </Link>;
        })}</div></div>)}
      </nav>

      <div className="m-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center gap-3"><CircleUserRound className="text-[#f6b545]" /><div className="min-w-0"><p className="truncate text-sm font-black">{identity.displayName || "Administrator"}</p><p className="truncate text-xs text-slate-400">{identity.email || "Role verified"}</p></div></div>
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-400/10 px-3 py-2 text-[10px] font-black text-emerald-300"><ShieldCheck size={13}/>ADMIN ROLE VERIFIED</div>
      </div>
    </aside>

    <div className="lg:pl-[292px]">
      <header className="sticky top-0 z-30 flex min-h-20 items-center gap-4 border-b border-[#e8e1ee] bg-white/94 px-5 py-3 backdrop-blur-xl sm:px-8">
        <button className="rounded-xl border border-[#e9e2ef] p-2.5 lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
        <Link href="/admin/search" className="group flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-[#e5ddeb] bg-[#faf8fc] px-4 py-3 transition hover:border-[#c7b3e3] hover:bg-white">
          <Search size={18} className="shrink-0 text-[#6930ca]"/><span className="truncate text-sm font-semibold text-[#7d7086]">Search mobile, email, customer/chef ID, order, payment, refund or delivery…</span><span className="ml-auto hidden rounded-lg border border-[#e4dceb] bg-white px-2 py-1 text-[10px] font-black text-[#8d7b99] sm:inline">GLOBAL SEARCH</span>
        </Link>
        <div className="hidden items-center gap-2 text-xs font-black text-[#34734f] xl:flex"><span className="h-2 w-2 rounded-full bg-emerald-500"/>Live backend data</div>
      </header>
      <main className="mx-auto max-w-[1640px] p-5 sm:p-8">{children}</main>
    </div>
  </div>;
}

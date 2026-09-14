"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  BarChart3, Users, PackageSearch, ArrowRight, BellRing, ChefHat, CircleUserRound, ClipboardList, Gauge, GraduationCap,
  LayoutDashboard, LogOut, Menu, ReceiptText, Search, SearchCheck, ShieldCheck, Truck, X
} from "lucide-react";
import type { AdminIdentity } from "@/lib/admin-contract";
import { observeAdminSession, logoutAdminSession, type SessionState } from "@/lib/admin-renewal";
import { loadAdminIdentity } from "@/lib/admin-session";
import { ADMIN_MODULES, matchesAdminRoute, searchAdminModules } from "@/lib/admin-navigation";
import { AdminModuleLink } from "@/components/admin-module-link";
import { SyncfusionLicense } from "@/components/syncfusion-license";
import { CravesLogo } from "@/components/brand/CravesLogo";
import { AcademyWorkspace } from "@/components/academy-workspace";
import "@/styles/admin-control.css";

const icons = {
  analytics: BarChart3, users: Users, "chef-explorer": ChefHat, "order-explorer": PackageSearch,
  overview: LayoutDashboard, search: Search, modules: Menu, operations: SearchCheck,
  delivery: Truck, chefs: ChefHat, accounts: ShieldCheck, finance: ReceiptText,
  plans: ReceiptText, subscriptions: ClipboardList, capacity: Gauge,
  notifications: BellRing, academy: GraduationCap
};

function Navigation({ pathname, close }: { pathname: string; close?: () => void }) {
  const groups = [...new Set(ADMIN_MODULES.map(module => module.group))];
  return <nav className="cr-navigation" aria-label="Administration modules">
    {groups.map(group => <div className="cr-nav-group" key={group}><p className="cr-nav-label">{group}</p>
      {ADMIN_MODULES.filter(module => module.group === group).map(module => {
        const Icon = icons[module.id as keyof typeof icons] ?? LayoutDashboard;
        return <AdminModuleLink key={module.id} module={module} className="cr-nav-link" current={matchesAdminRoute(pathname, module.href)} onNavigate={close}>
          <Icon size={18} aria-hidden="true"/><span>{module.label}</span>{module.externalApp && <ArrowRight size={14} aria-hidden="true"/>}
        </AdminModuleLink>;
      })}
    </div>)}
  </nav>;
}

function Brand() {
  return <Link href="/admin" className="cr-brand"><CravesLogo size="md" priority/><span><strong>Craves</strong><small>ADMIN CONTROL CENTER</small></span></Link>;
}

export function AdminWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);
  const [message, setMessage] = useState("Verifying administrator access…");
  const [sessionState, setSessionState] = useState<SessionState>("checking");
  const [query, setQuery] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const menu = useRef<HTMLDialogElement>(null);
  const commands = useRef<HTMLDialogElement>(null);
  const commandInput = useRef<HTMLInputElement>(null);
  const allowInteraction = sessionState === "ready" && identity !== null && message === "";

  useEffect(() => {
    let active = true;
    let authorizationGeneration = 0;
    const stop = observeAdminSession(state => {
      const generation = ++authorizationGeneration;
      setSessionState(state);
      menu.current?.close(); commands.current?.close();
      if (state === "ended") { setIdentity(null); setMessage("Your administrator session has ended. Please sign in again."); }
      if (state === "reconnecting") setMessage("Reconnecting securely. Your open workspace is kept in this tab.");
      if (state === "ready") {
        setMessage("Verifying administrator access…");
        void loadAdminIdentity()
          .then(admin => { if (active && generation === authorizationGeneration) { setIdentity(admin); setMessage(""); } })
          .catch(error => {
            if (active && generation === authorizationGeneration) {
              // Never retain an earlier authorization after a failed re-check.
              setIdentity(null);
              setMessage(error instanceof Error ? error.message : "Administrator access is unavailable.");
            }
          });
      }
    });
    return () => { active = false; stop(); };
  }, []);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (allowInteraction && !event.isComposing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        commands.current?.showModal();
        commandInput.current?.focus();
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [allowInteraction]);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setLogoutError("");
    try { await logoutAdminSession(); }
    catch { setLogoutError("Sign out did not complete. Please try again."); }
    finally { setSigningOut(false); }
  }

  // Academy keeps its purpose-built, already Craves-branded learning workspace.
  if (pathname === "/admin/academy" || pathname.startsWith("/admin/academy/")) {
    return <AcademyWorkspace identity={identity} message={message} sessionState={sessionState}>{children}</AcademyWorkspace>;
  }

  const current = ADMIN_MODULES.find(module => matchesAdminRoute(pathname, module.href));
  const results = searchAdminModules(query);
  const accessScreen = <main className="cr-admin cr-session-screen">
    <section className="cr-session-card"><CravesLogo size="lg" priority/><p className="cr-eyebrow">Craves administration</p>
      <h1>{sessionState === "reconnecting" ? "Reconnecting securely" : "Your control center starts here"}</h1>
      <p className="cr-muted" role="status">{message}</p>
      <div className="cr-actions">
        {sessionState !== "ended" && <button type="button" className="cr-button" onClick={() => window.location.reload()}>Retry connection</button>}
        <Link className="cr-button cr-primary" href={`/sign-in?returnTo=${encodeURIComponent(pathname)}`}>Administrator sign in<ArrowRight size={16} aria-hidden="true"/></Link>
      </div>
      <p className="cr-footnote">Only accounts approved by Craves can access administration.</p>
    </section>
  </main>;

  if (!identity) return accessScreen;

  return <>
    <div className="cr-admin cr-admin-shell" hidden={!allowInteraction}>
      <SyncfusionLicense/>
      <a className="cr-skip" href="#cr-admin-content">Skip to workspace</a>
      <aside className="cr-sidebar">
        <Brand/><Navigation pathname={pathname}/>
        <div className="cr-sidebar-account"><div className="cr-person"><CircleUserRound size={28} aria-hidden="true"/><div><strong>{identity.displayName || "Administrator"}</strong><span>{identity.email || "Craves administrator"}</span></div></div>
          <span className="cr-badge"><ShieldCheck size={13} aria-hidden="true"/>Admin access verified</span>
          <button type="button" className="cr-button cr-signout" onClick={() => void signOut()} disabled={signingOut}><LogOut size={16} aria-hidden="true"/>{signingOut ? "Signing out…" : "Sign out"}</button>
          {logoutError && <p role="alert" className="cr-error-text">{logoutError}</p>}
        </div>
      </aside>
      <div className="cr-main-area">
        <header className="cr-topbar">
          <button type="button" className="cr-icon-button cr-mobile-menu" aria-label="Open navigation" onClick={() => menu.current?.showModal()}><Menu size={20}/></button>
          <div className="cr-page-context"><span>{current?.group || "Administration"}</span><strong>{current?.label || "Admin workspace"}</strong></div>
          <button type="button" className="cr-command-trigger" aria-label="Find a module or task" onClick={() => { commands.current?.showModal(); commandInput.current?.focus(); }}><Search size={17} aria-hidden="true"/><span>Find a module or task…</span><kbd>Ctrl / ⌘ K</kbd></button>
          <Link className="cr-icon-button" href="/admin/notifications" aria-label="Open notification recovery" title="Notification recovery"><BellRing size={19}/></Link>
        </header>
        <main id="cr-admin-content" tabIndex={-1} className="cr-content">{children}</main>
        <footer className="cr-workspace-footer"><span>Craves administration</span><span>Authorized workflows · Timestamps labelled in IST</span></footer>
      </div>
      <dialog ref={menu} className="cr-dialog cr-menu-dialog" aria-label="Admin navigation" onClick={event => { if (event.target === event.currentTarget) menu.current?.close(); }}>
        <div className="cr-menu-inner"><div className="cr-dialog-heading"><Brand/><button className="cr-icon-button" onClick={() => menu.current?.close()} aria-label="Close navigation"><X size={20}/></button></div>
          <Navigation pathname={pathname} close={() => menu.current?.close()}/>
          <button className="cr-button" onClick={() => void signOut()} disabled={signingOut}><LogOut size={16} aria-hidden="true"/>{signingOut ? "Signing out…" : "Sign out"}</button>
          {logoutError && <p role="alert" className="cr-error-text">{logoutError}</p>}
        </div>
      </dialog>
      <dialog ref={commands} className="cr-dialog cr-command-dialog" aria-labelledby="cr-command-title" onClick={event => { if (event.target === event.currentTarget) commands.current?.close(); }}>
        <div className="cr-command-inner"><div className="cr-dialog-heading"><h2 id="cr-command-title">Where do you need to go?</h2><button className="cr-icon-button" onClick={() => commands.current?.close()} aria-label="Close module search"><X size={20}/></button></div>
          <label className="cr-search-field"><Search size={18} aria-hidden="true"/><span className="cr-sr-only">Search module names and tasks</span><input ref={commandInput} type="search" placeholder="Try orders, finance, chefs, training…" value={query} onChange={event => setQuery(event.target.value)} maxLength={100}/></label>
          <p className="cr-footnote">This searches workspace names. Use Global search for customers, chefs or transaction references.</p>
          <div className="cr-command-results">{results.map(module => <AdminModuleLink key={module.id} module={module} className="cr-command-result" onNavigate={() => { commands.current?.close(); setQuery(""); }}><span><strong>{module.label}</strong><small>{module.description}</small></span><ArrowRight size={18} aria-hidden="true"/></AdminModuleLink>)}</div>
          {results.length === 0 && <p className="cr-empty" role="status">No matching module. Try a different task.</p>}
        </div>
      </dialog>
    </div>
    {!allowInteraction && accessScreen}
  </>;
}

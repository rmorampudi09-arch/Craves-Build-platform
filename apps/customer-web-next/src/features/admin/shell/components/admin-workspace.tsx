"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { type KeyboardEvent, type ReactNode, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, BarChart3, Bike, ChefHat, Inbox, LayoutGrid, LogOut, Menu, PackageSearch, Search, SlidersHorizontal, Sun, Users, Wallet, X
} from "lucide-react";
import { observeAdminSession, logoutAdminSession } from "@/features/admin/shell/lib/admin-renewal";
import { createAdminAuthorization, INITIAL_ADMIN_AUTHORIZATION } from "@/features/admin/shell/lib/admin-authorization";
import { loadAdminIdentity } from "@/features/admin/shell/lib/admin-session";
import {
  ADMIN_AREAS, adminArea, adminOrderReference, areaTabs, currentAdminTab, oldAdminName, searchAdminPages, type AdminAreaId, type AdminSearchHit
} from "@/features/admin/shell/lib/admin-navigation";
import { ago, areaCounts, recentSos, riderState, type AttentionData } from "@/features/admin/shell/lib/admin-attention";
import { useAdminAttention } from "@/features/admin/shell/lib/use-admin-attention";
import { handOff } from "@/features/admin/shell/lib/admin-handoff";
import { SyncfusionLicense } from "@/features/admin/shell/components/syncfusion-license";
import { CravesLogo } from "@/shared/components/brand/CravesLogo";
import { AcademyWorkspace } from "@/features/admin/academy/components/academy-workspace";
import "@/features/admin/styles/admin-control.css";

const ICONS: Record<AdminAreaId, typeof Sun> = {
  today: Sun, inbox: Inbox, orders: PackageSearch, customers: Users, kitchens: ChefHat, riders: Bike, finance: Wallet, reports: BarChart3, settings: SlidersHorizontal,
};
const PHONE_BAR: readonly AdminAreaId[] = ["today", "inbox", "orders", "riders"];
const WHAT: Partial<Record<AdminAreaId, string>> = { inbox: "open help requests", orders: "orders need attention", kitchens: "waiting for you", riders: "rider checks waiting", finance: "money items waiting" };
const START: readonly string[] = ["/admin", "/admin/support", "/admin/orders", "/admin/chef-reviews", "/admin/riders/selfies", "/admin/fleet-setup", "/admin/finance", "/admin/analytics"];

/** The page's place in the menu: its tab and area, also on pages whose tab is chosen by a ?tab= or ?section= query. */
function usePlace() {
  const pathname = usePathname();
  const search = useSearchParams();
  return useMemo(() => {
    const found = currentAdminTab(pathname, search);
    return { pathname, found, area: pathname === "/admin/modules" ? null : found?.tab.area ?? null };
  }, [pathname, search]);
}

function Badge({ count, urgent, what }: { count?: number; urgent?: boolean; what: string }) {
  if (!count) return null;
  return <span className="ad-count" data-urgent={urgent || undefined} title={`${count} ${what}`}><span className="cr-sr-only">, </span>{count}<span className="cr-sr-only"> {what}</span></span>;
}

function AreaLinks({ data, close }: { data: AttentionData; close?: () => void }) {
  const { area, pathname } = usePlace();
  const counts = areaCounts(data);
  return <>
    {ADMIN_AREAS.map(item => {
      const Icon = ICONS[item.id];
      const badge = counts[item.id as keyof typeof counts];
      return <Link key={item.id} href={item.href} prefetch={false} className="ad-nav-link" aria-current={area === item.id ? "page" : undefined} onClick={close}>
        <Icon size={18} aria-hidden="true"/><span className="ad-nav-label">{item.label}</span><Badge count={badge?.count} urgent={badge?.urgent} what={WHAT[item.id] ?? "waiting"}/>
      </Link>;
    })}
    <div className="ad-nav-sep" role="presentation"/>
    <Link href="/admin/modules" prefetch={false} className="ad-nav-link" aria-current={pathname === "/admin/modules" ? "page" : undefined} onClick={close}>
      <LayoutGrid size={18} aria-hidden="true"/><span className="ad-nav-label">All tools</span>
    </Link>
  </>;
}

function Crumbs() {
  const { found } = usePlace();
  if (!found) return <div className="ad-crumbs"><b>Craves Admin</b></div>;
  const area = adminArea(found.tab.area);
  const showTab = found.tab.label !== area.label;
  return <div className="ad-crumbs">
    {found.detail && <Link className="ad-back" href={found.tab.href} aria-label={`Back to ${found.tab.label}`}><ArrowLeft size={20} aria-hidden="true"/></Link>}
    <span className="ad-crumb-path">{showTab || found.detail ? <Link href={area.href} prefetch={false}>{area.label}</Link> : <b>{area.label}</b>}
      {showTab && <><span aria-hidden="true">/</span>{found.detail ? <Link href={found.tab.href} prefetch={false}>{found.tab.label}</Link> : <b>{found.tab.label}</b>}</>}
    </span>
    <b className="ad-crumb-phone">{showTab && !found.detail ? found.tab.label : area.label}</b>
  </div>;
}

function Banners({ data }: { data: AttentionData }) {
  const { pathname } = usePlace();
  const sos = recentSos(data);
  const state = riderState(data);
  const showSos = sos.length > 0 && pathname !== "/admin/fleet-support";
  const showState = Boolean(state?.everyPage) && pathname !== "/admin/fleet-setup";
  if (!showSos && !showState) return null;
  return <section className="ad-banners" aria-label="Alerts">
    {showSos && <Link className="ad-banner ad-banner-sos" href="/admin/fleet-support">
      <span className="ad-dot" aria-hidden="true"/><span><b>SOS from rider {sos[0].riderName}</b> · {ago(sos[0].at)} · {sos[0].alerted ? "the alert email was sent" : "the alert email hasn't gone yet"}</span><span className="ad-banner-go" aria-hidden="true">Open</span>
    </Link>}
    {showState && state && <Link className="ad-banner ad-banner-state" href="/admin/fleet-setup">
      <AlertTriangle size={16} aria-hidden="true"/><span><b>{state.text}</b> · {state.note}</span><span className="ad-banner-go" aria-hidden="true">Open</span>
    </Link>}
  </section>;
}

/** The area's title, what this page is for, its old name, and the area's tabs. Today and detail pages draw their own header. */
function AreaHeader() {
  const { found, pathname } = usePlace();
  if (!found || found.detail || pathname === "/admin") return null;
  const tabs = areaTabs(found.tab.area);
  const old = oldAdminName(found.tab);
  return <>
    <header className="ad-ph">
      <div><h1>{adminArea(found.tab.area).label}</h1><p>{found.tab.summary}</p>{old && <p className="ad-was">In the old admin: “{old}”</p>}</div>
    </header>
    {tabs.length > 1 && <nav className="ad-tabs" aria-label={`${adminArea(found.tab.area).label} pages`}>
      {tabs.map(tab => <Link key={tab.href} href={tab.href} prefetch={false} aria-current={tab === found.tab ? "page" : undefined}>{tab.label}</Link>)}
    </nav>}
  </>;
}

function CommandResults({ query, close }: { query: string; close: () => void }) {
  const typed = query.trim();
  const order = adminOrderReference(typed);
  const pages: AdminSearchHit[] = typed ? searchAdminPages(typed).slice(0, 8) : START.flatMap(href => searchAdminPages("").filter(hit => hit.href === href));
  const people = typed.length > 1 && !order;
  const count = pages.length + (order ? 1 : 0) + (people ? 3 : 0);
  return <>
    <p className="cr-sr-only" role="status">{typed ? `${count} ${count === 1 ? "result" : "results"}` : ""}</p>
    <ul className="ad-cmd-list" id="ad-cmd-list">
      {order && <><li className="ad-cmd-group">Orders</li><li>{order.kind === "full"
        ? <Link href={`/admin/operations?reference=${order.value}`} onClick={close}><PackageSearch size={16} aria-hidden="true"/><span>Look up order {order.value.slice(0, 8).toUpperCase()}<small>Orders › Look up an order. The lookup asks for a reason.</small></span></Link>
        : <Link href={`/admin/finance?tab=transactions&q=${order.value}`} onClick={close}><PackageSearch size={16} aria-hidden="true"/><span>{order.value.length === 8 ? `Find order #${order.value}` : `Find #${order.value} in Finance`}<small>Finance › Transactions: its payment, refund and payouts</small></span></Link>}</li></>}
      {pages.length > 0 && <li className="ad-cmd-group">{typed ? "Pages" : "Go to"}</li>}
      {pages.map(hit => <li key={hit.href}>{hit.external
        ? <a href={hit.href} onClick={close}><ArrowRight size={16} aria-hidden="true"/><span>{hit.label}<small>{hit.detail}</small></span></a>
        : <Link href={hit.href} prefetch={false} onClick={close}><ArrowRight size={16} aria-hidden="true"/><span>{hit.label}<small>{hit.detail}</small></span></Link>}</li>)}
      {people && <><li className="ad-cmd-group">Look for “{typed}”</li>
        <li><Link href="/admin/search" onClick={() => { handOff("customers", typed); close(); }}><Users size={16} aria-hidden="true"/><span>In customers and chefs<small>Customers › Find a customer. It asks for a reason, which is recorded.</small></span></Link></li>
        <li><Link href="/admin/riders" onClick={() => { handOff("riders", typed); close(); }}><Bike size={16} aria-hidden="true"/><span>In riders<small>Riders, by name or the last digits of the phone</small></span></Link></li>
        <li><Link href="/admin/explorer/chefs" onClick={() => { handOff("kitchens", typed); close(); }}><ChefHat size={16} aria-hidden="true"/><span>In kitchen applications<small>Kitchens › All kitchens</small></span></Link></li></>}
      {count === 0 && <li className="ad-cmd-group">Nothing matches “{typed}”. Try one word, like payout, rider or refund.</li>}
    </ul>
  </>;
}

function Brand() {
  return <Link href="/admin" className="ad-brand"><CravesLogo size="sm" priority/><span><strong>Craves Admin</strong><small>Owners&apos; workspace</small></span></Link>;
}

export function AdminWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [{ identity, message, sessionState }, setAuthorization] = useState(INITIAL_ADMIN_AUTHORIZATION);
  const [query, setQuery] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [logoutStarted, setLogoutStarted] = useState(false);
  const [logoutConfirmed, setLogoutConfirmed] = useState(false);
  const logoutInFlight = useRef(false);
  const menu = useRef<HTMLDialogElement>(null);
  const commands = useRef<HTMLDialogElement>(null);
  const commandInput = useRef<HTMLInputElement>(null);
  const allowInteraction = sessionState === "ready" && identity !== null && message === "";
  const { data } = useAdminAttention(allowInteraction, pathname);

  useEffect(() => {
    const authorization = createAdminAuthorization({
      loadIdentity: loadAdminIdentity,
      publish: setAuthorization,
      closeDialogs: () => { menu.current?.close(); commands.current?.close(); },
    });
    const stop = observeAdminSession(state => { void authorization.accept(state); });
    return () => { authorization.dispose(); stop(); };
  }, []);

  useEffect(() => {
    function handleShortcut(event: globalThis.KeyboardEvent) {
      if (allowInteraction && !event.isComposing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        menu.current?.close();
        if (!commands.current?.open) commands.current?.showModal();
        commandInput.current?.focus();
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [allowInteraction]);

  function openCommands() {
    menu.current?.close();
    if (!commands.current?.open) commands.current?.showModal();
    commandInput.current?.focus();
  }

  function commandKeys(event: KeyboardEvent<HTMLDialogElement>) {
    const items = [...(commands.current?.querySelectorAll<HTMLAnchorElement>("#ad-cmd-list a") ?? [])];
    if (event.key === "Enter" && event.target === commandInput.current && items[0]) { event.preventDefault(); items[0].click(); return; }
    if ((event.key !== "ArrowDown" && event.key !== "ArrowUp") || !items.length) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLAnchorElement);
    const next = event.key === "ArrowDown" ? (index + 1) % items.length : index - 1;
    (next < 0 ? commandInput.current : items[next])?.focus();
  }

  async function signOut() {
    if (logoutInFlight.current) return;
    logoutInFlight.current = true;
    setLogoutStarted(true);
    setSigningOut(true);
    setLogoutError("");
    try { await logoutAdminSession(); setLogoutConfirmed(true); }
    catch { setLogoutError("Sign out has not been confirmed. This workspace is locked. Retry sign out to finish securely."); }
    finally { logoutInFlight.current = false; setSigningOut(false); }
  }

  // Keep the retry reachable after local authorization is cleared, including Academy.
  if (logoutStarted) return <main className="cr-admin cr-session-screen">
    <section className="cr-session-card"><CravesLogo size="lg" priority/><p className="cr-eyebrow">Craves administration</p>
      <h1>{logoutConfirmed ? "Signed out" : signingOut ? "Signing out securely" : "Finish signing out"}</h1>
      <p className="cr-muted" role={logoutError ? "alert" : "status"}>{logoutError || (logoutConfirmed ? "Your Craves session has been signed out." : "This workspace is locked while Craves confirms sign out.")}</p>
      <div className="cr-actions">{logoutConfirmed
        ? <Link className="cr-button cr-primary" href={`/sign-in?returnTo=${encodeURIComponent(pathname)}`}>Administrator sign in</Link>
        : <button type="button" className="cr-button cr-primary" onClick={() => void signOut()} disabled={signingOut}>{signingOut ? "Signing out…" : "Retry sign out"}</button>}
      </div>
    </section>
  </main>;

  // Academy keeps its purpose-built, already Craves-branded learning workspace.
  if (pathname === "/admin/academy" || pathname.startsWith("/admin/academy/")) {
    return <AcademyWorkspace identity={identity} message={message} sessionState={sessionState} onSignOut={() => { void signOut(); }}>{children}</AcademyWorkspace>;
  }

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
  const name = identity.displayName || "Administrator";
  const counts = areaCounts(data);
  const phoneArea = currentAdminTab(pathname)?.tab.area;

  return <>
    <div className="cr-admin cr-admin-shell ad-shell" hidden={!allowInteraction}>
      <SyncfusionLicense/>
      <a className="cr-skip" href="#cr-admin-content">Skip to the page</a>
      <aside className="ad-side" aria-label="Menu and account">
        <Brand/>
        <button type="button" className="ad-find" onClick={openCommands}><Search size={16} aria-hidden="true"/><span>Search</span><kbd>Ctrl K</kbd></button>
        <nav className="ad-nav" aria-label="Main menu"><Suspense><AreaLinks data={data}/></Suspense></nav>
        <div className="ad-side-foot">
          <div className="ad-person"><span className="ad-avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span><div><strong>{name}</strong><span>{identity.email || "Owner"}</span></div></div>
          <button type="button" className="cr-button ad-signout" onClick={() => void signOut()} disabled={signingOut}><LogOut size={16} aria-hidden="true"/>{signingOut ? "Signing out…" : "Sign out"}</button>
          {logoutError && <p role="alert" className="cr-error-text">{logoutError}</p>}
        </div>
      </aside>
      <div className="ad-main">
        <header className="ad-top">
          <Suspense fallback={<div className="ad-crumbs"/>}><Crumbs/></Suspense>
          <button type="button" className="ad-top-search" aria-label="Search" onClick={openCommands}><Search size={20} aria-hidden="true"/></button>
        </header>
        <Suspense><Banners data={data}/></Suspense>
        <main id="cr-admin-content" tabIndex={-1} className="ad-sheet">
          <div className="cr-content ad-content"><Suspense><AreaHeader/></Suspense>{children}</div>
        </main>
      </div>
      <nav className="ad-bottom" aria-label="Quick menu">
        {PHONE_BAR.map(id => {
          const area = adminArea(id);
          const Icon = ICONS[id];
          const badge = counts[id as keyof typeof counts];
          return <Link key={id} href={area.href} prefetch={false} aria-current={phoneArea === id ? "page" : undefined}><Icon size={20} aria-hidden="true"/>{area.label}<Badge count={badge?.count} urgent={badge?.urgent} what={WHAT[id] ?? "waiting"}/></Link>;
        })}
        <button type="button" aria-current={phoneArea && PHONE_BAR.includes(phoneArea) ? undefined : "true"} onClick={() => menu.current?.showModal()}><Menu size={20} aria-hidden="true"/>Menu</button>
      </nav>
      <dialog ref={menu} className="cr-dialog ad-menu" aria-label="Admin navigation" onClick={event => { if (event.target === event.currentTarget) menu.current?.close(); }}>
        <div className="ad-menu-inner"><div className="cr-dialog-heading"><Brand/><button type="button" className="cr-icon-button" onClick={() => menu.current?.close()} aria-label="Close navigation"><X size={20}/></button></div>
          <nav className="ad-nav" aria-label="Menu"><Suspense><AreaLinks data={data} close={() => menu.current?.close()}/></Suspense></nav>
          <button type="button" className="cr-button" onClick={() => void signOut()} disabled={signingOut}><LogOut size={16} aria-hidden="true"/>{signingOut ? "Signing out…" : "Sign out"}</button>
          {logoutError && <p role="alert" className="cr-error-text">{logoutError}</p>}
        </div>
      </dialog>
      <dialog ref={commands} className="cr-dialog ad-cmd" aria-label="Search" onKeyDown={commandKeys} onClick={event => { if (event.target === event.currentTarget) commands.current?.close(); }}>
        <div className="ad-cmd-inner">
          <label className="ad-cmd-field"><Search size={18} aria-hidden="true"/><span className="cr-sr-only">Search pages, old menu names and order numbers</span>
            <input ref={commandInput} type="search" placeholder="Search pages, old menu names, order numbers…" value={query} maxLength={100} onChange={event => setQuery(event.target.value)}
              onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); commands.current?.close(); } }}/></label>
          <CommandResults query={query} close={() => { commands.current?.close(); setQuery(""); }}/>
        </div>
      </dialog>
    </div>
    {!allowInteraction && accessScreen}
  </>;
}

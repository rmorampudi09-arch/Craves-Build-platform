"use client";

import { InvestigationPanel } from "@/components/investigation-panel";
import { OverviewPanel } from "@/components/overview-panel";
import { HistoryFilterBar } from "@/components/history-filters";
import { DEFAULT_FILTERS, historyQuery, rangeLabel, type HistoryFilters } from "@/lib/history-filters";
import type { AdminIdentity } from "@/lib/admin-contract";
import type { DeliveryOverview, OrderInvestigation } from "@/lib/delivery-contract";
import { AlertTriangle, BarChart3, ChevronRight, CircleHelp, Database, LogIn, Search, ShieldCheck, Truck, X } from "lucide-react";
import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

const BASE_PATH = "/delivery-intelligence";
const POLL_MS = 20_000;

type View = "overview" | "investigation";

type ApiError = { code?: string; message?: string };

async function json<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as T | ApiError | null;
  if (!response.ok) {
    const error = body && typeof body === "object" && "code" in body ? String(body.code) : `HTTP_${response.status}`;
    throw new Error(error);
  }
  return body as T;
}

function signedOutRedirect() {
  const returnTo = encodeURIComponent(BASE_PATH);
  window.location.assign(`/sign-in?returnTo=${returnTo}`);
}

export function DeliveryIntelligenceApp() {
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);
  const [overview, setOverview] = useState<DeliveryOverview | null>(null);
  const [investigation, setInvestigation] = useState<OrderInvestigation | null>(null);
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [investigationLoading, setInvestigationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<HistoryFilters>({ ...DEFAULT_FILTERS });
  const [overviewQuery, setOverviewQuery] = useState(() => historyQuery(DEFAULT_FILTERS).toString());
  const [refreshVersion, setRefreshVersion] = useState(0);
  const overviewRequest = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);
  const pageQuery = new URLSearchParams(overviewQuery);
  const autoRefresh = filters.range !== "custom" && filters.sort === "desc"
    && Number(pageQuery.get("offset")) === 0 && Number(pageQuery.get("attentionOffset")) === 0;

  const loadOverview = useCallback(async () => {
    overviewRequest.current?.abort();
    const controller = new AbortController();
    overviewRequest.current = controller;
    const sequence = ++requestSequence.current;
    setOverviewLoading(true);
    try {
      const response = await fetch(`${BASE_PATH}/api/delivery-intelligence/overview?${overviewQuery}`, {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (response.status === 401) return signedOutRedirect();
      if (response.status === 403) throw new Error("ADMIN_ACCESS_REQUIRED");
      const data = await json<DeliveryOverview>(response);
      if (sequence !== requestSequence.current) return;
      setOverview(data);
      setError(null);
    } catch (cause) {
      if (controller.signal.aborted || sequence !== requestSequence.current) return;
      setError(cause instanceof Error ? cause.message : "DELIVERY_INTELLIGENCE_UNAVAILABLE");
    } finally {
      if (sequence === requestSequence.current) setOverviewLoading(false);
    }
  }, [overviewQuery]);

  const refreshOverview = useCallback(() => {
    setOverviewQuery(historyQuery(filters).toString());
    setRefreshVersion(version => version + 1);
  }, [filters]);

  function applyFilters(next: HistoryFilters) {
    setFilters(next);
    setOverview(null);
    setOverviewQuery(historyQuery(next).toString());
    setRefreshVersion(version => version + 1);
  }

  function changePage(section: "activity" | "attention", direction: number) {
    if (!overview || overviewLoading) return;
    const params = new URLSearchParams(overviewQuery);
    // Retain the selected interval while browsing pages; refresh starts a new window.
    params.set("hours", "0");
    params.set("from", overview.windowStart);
    params.set("to", overview.windowEnd);
    const offset = section === "activity" ? overview.activityOffset : overview.attentionOffset;
    params.set(section === "activity" ? "offset" : "attentionOffset", String(Math.max(0, offset + direction * overview.pageSize)));
    setOverviewQuery(params.toString());
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`${BASE_PATH}/api/admin/me`, { cache: "no-store", credentials: "same-origin" });
        if (response.status === 401) return signedOutRedirect();
        if (response.status === 403) throw new Error("ADMIN_ACCESS_REQUIRED");
        const admin = await json<AdminIdentity>(response);
        if (!active) return;
        setIdentity(admin);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "IDENTITY_UNAVAILABLE");
      } finally {
        if (active) setAuthLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!identity || view !== "overview") return;
    void loadOverview();
    return () => { overviewRequest.current?.abort(); requestSequence.current += 1; };
  }, [identity, view, loadOverview, refreshVersion]);

  useEffect(() => {
    if (!identity || view !== "overview" || !autoRefresh) return;
    const timer = window.setInterval(refreshOverview, POLL_MS);
    return () => window.clearInterval(timer);
  }, [identity, refreshOverview, view, autoRefresh]);

  const investigate = useCallback(async (reference: string) => {
    const normalized = reference.trim();
    if (!normalized) return;
    setInvestigationLoading(true);
    setError(null);
    try {
      const response = await fetch(`${BASE_PATH}/api/delivery-intelligence/orders/${encodeURIComponent(normalized)}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (response.status === 401) return signedOutRedirect();
      if (response.status === 404) throw new Error("DELIVERY_REFERENCE_NOT_FOUND");
      if (response.status === 403) throw new Error("ADMIN_ACCESS_REQUIRED");
      const data = await json<OrderInvestigation>(response);
      setInvestigation(data);
      setQuery(normalized);
      setView("investigation");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "DELIVERY_INVESTIGATION_UNAVAILABLE");
    } finally {
      setInvestigationLoading(false);
    }
  }, []);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    void investigate(query);
  };

  const displayName = useMemo(() => identity?.displayName?.trim() || identity?.email?.split("@")[0] || "Craves Admin", [identity]);

  if (authLoading) {
    return <div className="boot-screen"><div className="boot-logo"><Image src="/delivery-intelligence/brand/craves-logo-20260805.png" alt="Craves" width={64} height={64} priority /></div><div className="boot-spinner" /><p>Securing Delivery Intelligence…</p></div>;
  }

  if (!identity && error) {
    return (
      <main className="fatal-screen">
        <Image src="/delivery-intelligence/brand/craves-logo-20260805.png" alt="Craves" width={72} height={72} />
        <h1>Delivery Intelligence</h1>
        <p>{error === "ADMIN_ACCESS_REQUIRED" ? "An active Craves admin role is required for this workspace." : "The admin identity service is temporarily unavailable."}</p>
        <button type="button" className="primary-button" onClick={signedOutRedirect}><LogIn size={17} />Go to Craves admin sign-in</button>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <Image src="/delivery-intelligence/brand/craves-logo-20260805.png" alt="Craves" width={44} height={44} priority />
          <div><strong>CRAVES</strong><span>Delivery Intelligence</span></div>
        </div>

        <nav className="side-nav" aria-label="Delivery Intelligence navigation">
          <p className="nav-label">MONITOR</p>
          <button type="button" className={view === "overview" ? "nav-item active" : "nav-item"} onClick={() => setView("overview")}><BarChart3 size={17} /><span>Overview</span><ChevronRight size={14} /></button>
          <button type="button" className={view === "investigation" ? "nav-item active" : "nav-item"} onClick={() => setView("investigation")}><Search size={17} /><span>Order investigation</span><ChevronRight size={14} /></button>
          <div className="nav-item disabled"><AlertTriangle size={17} /><span>Exceptions</span>{overview && overview.metrics.attentionCount > 0 && <b>{overview.metrics.attentionCount}</b>}</div>
          <p className="nav-label nav-reference">REFERENCE</p>
          <div className="nav-item disabled"><Truck size={17} /><span>Provider telemetry</span></div>
          <div className="nav-item disabled"><Database size={17} /><span>Event evidence</span></div>
        </nav>

        <div className="sidebar-safety"><ShieldCheck size={16} /><div><strong>READ ONLY</strong><span>No dispatch actions</span></div></div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="page-title">
            <h1>{view === "overview" ? "Delivery Intelligence" : "Order investigation"}</h1>
            <p>{view === "overview" ? "Live operational picture of Craves delivery orchestration" : "Trace persisted routing, create, webhook, tracking and recovery evidence"}</p>
          </div>
          <form className="global-search" onSubmit={submitSearch}>
            <Search size={16} />
            <input aria-label="Search order or provider reference" placeholder="Order ID or provider delivery reference" value={query} onChange={event => setQuery(event.target.value)} maxLength={200} />
            {query && <button type="button" className="search-clear" onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></button>}
            <button type="submit" className="search-submit" disabled={investigationLoading}>{investigationLoading ? "Searching…" : "Investigate"}</button>
          </form>
          <div className="admin-chip"><div className="admin-avatar">{displayName.slice(0, 2).toUpperCase()}</div><div><strong>{displayName}</strong><span>Craves Admin</span></div></div>
        </header>

        <div className="content-area">
          {view === "overview" && <HistoryFilterBar filters={filters} onApply={applyFilters} loading={overviewLoading} />}
          {error && (
            <div className="error-banner"><AlertTriangle size={17} /><span>{friendlyError(error)}</span><button type="button" onClick={() => setError(null)}><X size={15} /></button></div>
          )}

          {view === "overview" && overview ? (
            <OverviewPanel data={overview} loading={overviewLoading} onRefresh={refreshOverview}
              rangeLabel={rangeLabel(filters)} sort={filters.sort} autoRefresh={autoRefresh}
              onPage={changePage} onInvestigate={reference => void investigate(reference)} />
          ) : view === "overview" ? (
            <div className="loading-panel"><div className="boot-spinner" /><p>Loading delivery telemetry…</p></div>
          ) : investigation ? (
            <InvestigationPanel data={investigation} onBack={() => setView("overview")} />
          ) : (
            <section className="investigation-empty surface-card">
              <div className="empty-icon"><Search size={26} /></div>
              <h2>Investigate a delivery</h2>
              <p>Enter a Craves order UUID, delivery job UUID, chef sub-order UUID, or provider delivery reference. The result is a sanitized read-only evidence timeline.</p>
              <form className="empty-search" onSubmit={submitSearch}><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Paste order or provider reference" maxLength={200} autoFocus /><button type="submit" className="primary-button" disabled={!query.trim() || investigationLoading}><Search size={16} />{investigationLoading ? "Searching…" : "Investigate"}</button></form>
              <div className="empty-note"><CircleHelp size={15} /> Raw provider payloads, credentials, signatures and tracking URLs are never exposed here.</div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function friendlyError(code: string): string {
  switch (code) {
    case "DELIVERY_REFERENCE_NOT_FOUND": return "No delivery command or job matched that order/provider reference.";
    case "ADMIN_ACCESS_REQUIRED": return "Your current Craves identity does not have an active admin role for this operation.";
    case "DELIVERY_INTELLIGENCE_UNAVAILABLE": return "Delivery Intelligence could not reach the integration service. Existing delivery processing is not changed by this dashboard error.";
    case "DELIVERY_INVESTIGATION_UNAVAILABLE": return "The delivery investigation request could not be completed.";
    default: return `Delivery Intelligence reported ${code.replaceAll("_", " ").toLowerCase()}.`;
  }
}

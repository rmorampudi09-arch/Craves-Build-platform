"use client";

import Link from "next/link";
import { AlertTriangle, ChevronRight, RefreshCw } from "lucide-react";
import { lastWeek, orderStatusWords, riderState, todayFinding, todayRows, type TodayRow } from "@/features/admin/shell/lib/admin-attention";
import { useAdminAttention } from "@/features/admin/shell/lib/use-admin-attention";

const time = (at: number) => new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(at);
const date = (at: number) => new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(at);

function Row({ row }: { row: TodayRow }) {
  return <Link className="ad-q" href={row.href} data-urgent={row.urgent || undefined} data-failed={row.failed || undefined}>
    <span className="ad-q-n" aria-hidden="true">{row.failed ? "—" : `${row.count}${row.more ? "+" : ""}`}</span>
    <span><b>{!row.failed && <span className="cr-sr-only">{row.count}{row.more ? " or more" : ""} </span>}{row.label}</b><span className="ad-q-sub">{row.note}</span></span>
    <span className="ad-q-act" aria-hidden="true">{row.action}</span><ChevronRight className="ad-q-go" size={16} aria-hidden="true"/>
  </Link>;
}

/** Today: what needs an owner now, most urgent first, then where today's orders are. */
export function AdminToday() {
  const { data, checking, refresh } = useAdminAttention(true, "/admin");
  const { rows, nothing } = todayRows(data);
  const state = riderState(data);
  const loading = data.checkedAt === null;
  const now = data.checkedAt;
  const finding = loading ? "" : todayFinding(rows);
  const flow = data.orders.state === "ok" ? data.orders.value : null;
  // Two statuses can share the customer's words (Paid and Awaiting kitchen), so they share a row.
  const stages = new Map<string, number>();
  for (const item of flow?.statusCounts ?? []) stages.set(orderStatusWords(item.status), (stages.get(orderStatusWords(item.status)) ?? 0) + item.count);
  const week = flow && now ? lastWeek(flow.orderTrend, now) : [];
  const max = Math.max(1, ...week.map(day => day.count));
  const weekTotal = week.reduce((sum, day) => sum + day.count, 0);

  return <div className="ad-grid">
    <header className="ad-ph ad-today-head">
      <div><h1>Today</h1><p>{now ? `${date(now)}.` : "Checking what needs you."}{finding && <> <b>{finding}</b></>}</p><p className="ad-was">In the old admin: “Overview”</p></div>
      <div className="ad-stamp"><span role="status">{now ? `Updated ${time(now)}` : "Checking…"}</span>
        <button type="button" className="cr-button" onClick={() => void refresh()} disabled={checking || loading}><RefreshCw size={16} aria-hidden="true" className={checking ? "cr-spin" : ""}/>{checking ? "Checking…" : "Check again"}</button>
      </div>
    </header>
    <div className="ad-today">
      <section className="ad-panel" aria-labelledby="ad-now">
        <div className="ad-panel-h"><div><h2 id="ad-now">Needs you now</h2><p>Most urgent first. Each row opens the work.</p></div></div>
        <div className="ad-queue" aria-busy={loading}>
          {loading && <p className="ad-panel-b cr-muted">Checking orders, kitchens, riders, help requests and money…</p>}
          {state && <Link className="ad-q" href="/admin/fleet-setup" data-state=""><span className="ad-q-n" aria-hidden="true"><AlertTriangle size={24}/></span>
            <span><b>{state.text}</b><span className="ad-q-sub">{state.note}</span></span><span className="ad-q-act" aria-hidden="true">Open</span><ChevronRight className="ad-q-go" size={16} aria-hidden="true"/></Link>}
          {rows.map(row => <Row key={row.key} row={row}/>)}
        </div>
        {nothing.length > 0 && <p className="ad-folded">Nothing waiting: {nothing.join(", ")}.</p>}
        {!loading && <p className="ad-folded">Missed delivery and payment updates need a reason to open, so they aren&apos;t counted here. <Link href="/admin/dead-letters">Check them</Link>.</p>}
      </section>
      <div className="ad-grid">
        <section className="ad-panel" aria-labelledby="ad-stages">
          <div className="ad-panel-h"><div><h2 id="ad-stages">Orders by current status</h2><p>Every order in each step right now.</p></div></div>
          <div className="ad-panel-b">{flow ? (stages.size ? <div className="ad-stages">{[...stages].map(([words, count]) => <div className="ad-stage" key={words}><span>{words}</span><b>{count.toLocaleString("en-IN")}</b></div>)}</div>
            : <p className="cr-muted">No orders are in progress.</p>)
            : <p className="cr-muted">{data.orders.state === "failed" ? "Couldn't load order counts. Use Check again in a minute." : "Loading…"}</p>}</div>
        </section>
        <section className="ad-panel" aria-labelledby="ad-week">
          <div className="ad-panel-h"><div><h2 id="ad-week">Orders this week</h2><p>{week.length ? `Last ${week.length} days · ${weekTotal.toLocaleString("en-IN")} orders` : "Last 7 days"}</p></div></div>
          <div className="ad-panel-b">{week.length ? <div className="ad-bars" role="img" aria-label={`Orders per day: ${week.map(day => `${day.full} ${day.count}`).join(", ")}`}>
            {week.map(day => <div className="ad-bar" key={day.full}><em>{day.count}</em><i data-zero={day.count === 0 || undefined} style={{ height: day.count ? Math.max(8, Math.round(day.count / max * 64)) : 2 }}/><span>{day.label}</span></div>)}
          </div> : <p className="cr-muted">{data.orders.state === "failed" ? "Couldn't load the week." : "Loading…"}</p>}
            <p style={{ marginTop: 10 }}><Link className="cr-muted" href="/admin/analytics">More in Reports</Link></p></div>
        </section>
      </div>
    </div>
  </div>;
}

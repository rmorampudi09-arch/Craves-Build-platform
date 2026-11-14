"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, Search, X } from "lucide-react";
import { adminFetch } from "@/features/admin/shell/lib/admin-renewal";
import { formatAdminTimestamp } from "@/features/admin/shell/lib/admin-navigation";
import { ManualChefSettlementPanel } from "@/features/admin/finance/components/manual-chef-settlement-panel";
import type { Jump } from "@/features/admin/finance/components/finance-overview";
import { chefBalancesSchema, isZero, rupees, type ChefBalance } from "@/features/admin/finance/lib/insights-contract";
import { useInsights, usePaneFocus } from "@/features/admin/finance/lib/use-insights";

const hasMoney = (chef: ChefBalance) => ![chef.due, chef.notYetDue, chef.inProgress, chef.paid].every(isZero);
function standing(chef: ChefBalance): { label: string; tone: "success" | "warning" | "danger" | "neutral" } {
  if (chef.onHold) return { label: "On hold", tone: "danger" };
  if (!isZero(chef.due)) return { label: "Ready to pay", tone: "success" };
  if (!isZero(chef.inProgress)) return { label: "Being paid", tone: "warning" };
  return { label: isZero(chef.notYetDue) ? "Nothing owed" : "Not yet due", tone: "neutral" };
}

function HoldControl({ chef, onChanged }: { chef: ChefBalance; onChanged: () => void }) {
  const [reason, setReason] = useState("");
  const [state, setState] = useState({ busy: false, message: "" });
  async function send(onHold: boolean) {
    setState({ busy: true, message: "" });
    try {
      const response = await adminFetch(`/api/admin/finance/chefs/${chef.chefId}/hold`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ onHold, reason: reason.trim() }) });
      if (!response.ok) throw new Error(response.status === 403 ? "Your account can't hold or release payouts." : response.status === 404 ? "This chef has no payout record yet, so there is nothing to hold."
        : "The hold wasn't changed. Check your connection and try again.");
      setState({ busy: false, message: onHold ? "Payouts to this chef are on hold." : "The hold is released. Bank and refund checks still apply before anything is paid." });
      setReason(""); onChanged();
    } catch (error) { setState({ busy: false, message: error instanceof Error ? error.message : "The hold wasn't changed. Try again." }); }
  }
  return <details className="fn-details"><summary>Hold or release this chef’s payouts</summary>
    <div className="fn-form" style={{ marginTop: 12 }}>
      <label className="fn-field">Reason (kept in the record)<textarea maxLength={1000} value={reason} disabled={state.busy} onChange={event => setReason(event.target.value)} /></label>
      <div className="cr-actions"><button type="button" className="cr-button" disabled={state.busy || !reason.trim()} onClick={() => void send(true)}>Hold payouts</button>
        <button type="button" className="cr-button" disabled={state.busy || !reason.trim()} onClick={() => void send(false)}>Release the hold</button></div>
      {state.message && <p className="fn-small" role="status" style={{ color: "var(--fn-ink)" }}>{state.message}</p>}
    </div></details>;
}

/** Who is owed what today, and the place to pay them. Chef payouts only; rider payouts have their own page. */
export function FinancePayouts({ names, onJump }: { names: (chefId: string | null) => string; onJump: (jump: Jump) => void }) {
  const { data, error, loading, reload } = useInsights("view=chefs", chefBalancesSchema);
  const [open, setOpen] = useState<string | null>(null);
  const [find, setFind] = useState("");
  const pane = usePaneFocus(open);
  if (!data) return error
    ? <div className="fn-alert" role="alert" data-tone="danger"><AlertTriangle size={18} aria-hidden="true" /><span>{error}</span><button type="button" className="cr-button" onClick={reload}>Try again</button></div>
    : <div className="fn-card fn-skeleton" role="status" aria-label="Loading what chefs are owed">{Array.from({ length: 8 }, (_, index) => <span key={index} />)}</div>;
  const words = find.trim().toLocaleLowerCase("en-IN");
  // The list is every chef the payout engine knows. Those with no money yet stay out of the way until searched for.
  const chefs = data.chefs.filter(chef => words ? names(chef.chefId).toLocaleLowerCase("en-IN").includes(words) || chef.chefId.startsWith(words) : hasMoney(chef));
  const chef = data.chefs.find(row => row.chefId === open);
  const { position } = data;
  return <div style={{ display: "grid", gap: 16 }} aria-busy={loading}>
    {error && <div className="fn-alert" role="alert"><AlertTriangle size={18} aria-hidden="true" /><span>{error} Showing the last figures loaded.</span><button type="button" className="cr-button" onClick={reload}>Try again</button></div>}
    <dl className="fn-card fn-figures">
      <div><dt>Ready to pay</dt><dd className="fn-num">{rupees(position.readyToPay)}</dd><dd>{position.chefsToPay} {position.chefsToPay === 1 ? "chef" : "chefs"}</dd></div>
      <div><dt>On hold</dt><dd className="fn-num">{rupees(position.onHold)}</dd><dd>{position.chefsOnHold} {position.chefsOnHold === 1 ? "chef" : "chefs"}</dd></div>
      <div><dt>Not yet due</dt><dd className="fn-num">{rupees(position.notYetDue)}</dd><dd>Still inside the waiting time</dd></div>
      <div><dt>Being paid</dt><dd className="fn-num">{rupees(position.inProgress)}</dd><dd>Set aside or with the bank</dd></div>
    </dl>
    <div className="fn-split" data-open={chef ? "true" : undefined}>
      <section className="fn-card fn-list">
        <header><div><h2>What each chef is owed</h2><p className="fn-small">As of {formatAdminTimestamp(data.generatedAt)}. {data.payoutMode === "CRAVES_MANUAL"
          ? "Chefs are paid by bank transfer, recorded here by an admin." : "Chefs are paid automatically through RazorpayX."}</p></div>
          <label className="cr-search-field" style={{ width: 260 }}><Search size={16} aria-hidden="true" /><span className="cr-sr-only">Find a chef by name</span>
            <input type="search" value={find} maxLength={80} placeholder="Find a chef by name" onChange={event => setFind(event.target.value)} /></label></header>
        {chefs.length === 0 && !words ? <div className="fn-empty"><strong>No chef is owed anything yet</strong>
          <p className="fn-note">A chef appears here when one of their orders is delivered and its earning is recorded. Each row then shows what is ready, what is waiting and what has been paid.</p></div>
          : chefs.length === 0 ? <div className="fn-empty"><strong>No chef matches “{find}”</strong><p className="fn-note">Try part of the kitchen or chef name.</p></div>
          : <div className={loading ? "fn-stale" : undefined}><table className="fn-table"><caption className="cr-sr-only">Chefs with money owed or paid. Choose a row to pay or hold that chef.</caption>
            <thead><tr><th scope="col">Chef</th><th scope="col" className="fn-amount">Due now</th><th scope="col" className="fn-amount" data-extra="true">Not yet due</th>
              <th scope="col" className="fn-amount" data-extra="true">Being paid</th><th scope="col" className="fn-amount">Paid so far</th></tr></thead>
            <tbody>{chefs.map(row => {
              const status = standing(row);
              return <tr key={row.chefId} data-selected={open === row.chefId ? "true" : undefined} onClick={() => setOpen(row.chefId)}>
                <td data-wide="true"><button type="button" className="fn-rowbtn" aria-pressed={open === row.chefId}><strong>{names(row.chefId)}</strong>
                  <small><span className="fn-status" data-tone={status.tone}>{status.label}</span></small></button></td>
                <td className="fn-amount fn-num">{rupees(row.due)}</td><td className="fn-amount fn-num" data-extra="true">{rupees(row.notYetDue)}</td>
                <td className="fn-amount fn-num" data-extra="true">{rupees(row.inProgress)}</td>
                <td className="fn-amount fn-num">{rupees(row.paid)}{row.lastPaidAt && <small>last {formatAdminTimestamp(row.lastPaidAt)}</small>}</td>
              </tr>;
            })}</tbody></table></div>}
        <p className="fn-small" style={{ marginTop: 16 }}>A chef with nothing owed yet shows when you search for their name, so a hold can be placed early. Riders are paid from the <Link className="fn-link" href="/admin/fleet-payouts">Rider payouts</Link> page; their payouts also show under Transactions.</p>
      </section>
      {chef && <aside ref={pane} tabIndex={-1} className="fn-pane" aria-label={`Payouts for ${names(chef.chefId)}`}>
        <header><div><p className="fn-small">{names(chef.chefId)} · due now</p><p className="fn-figure fn-num">{rupees(chef.due)}</p>
          <span className="fn-status" data-tone={standing(chef).tone}>{standing(chef).label}</span></div>
          <button type="button" className="cr-icon-button" onClick={() => setOpen(null)} aria-label="Close this chef"><X size={18} aria-hidden="true" /></button></header>
        {chef.onHold && <p className="fn-note">{chef.holdReason ? `On hold: ${chef.holdReason}` : "On hold until this chef’s bank details, refunds or order records are cleared."}</p>}
        <dl className="fn-facts">
          <div><dt>Not yet due</dt><dd className="fn-num">{rupees(chef.notYetDue)}</dd></div>
          <div><dt>Being paid</dt><dd className="fn-num">{rupees(chef.inProgress)}</dd></div>
          <div><dt>Paid so far</dt><dd className="fn-num">{rupees(chef.paid)}</dd></div>
          <div><dt>Delivered orders counted</dt><dd className="fn-num">{chef.orders}</dd></div>
        </dl>
        {data.payoutMode === "CRAVES_MANUAL" ? <ManualChefSettlementPanel key={chef.chefId} chefId={chef.chefId} onChanged={reload} />
          : <p className="fn-note">Payouts go out automatically through RazorpayX once the earnings are due and the chef’s bank account is verified.</p>}
        <HoldControl key={`hold-${chef.chefId}`} chef={chef} onChanged={reload} />
        <div className="cr-actions"><button type="button" className="cr-button" onClick={() => onJump({ kind: "CHEF_EARNING", party: chef.chefId, days: 90 })}>This chef’s earnings</button>
          <button type="button" className="cr-button" onClick={() => onJump({ kind: "CHEF_PAYOUT", party: chef.chefId, days: 90 })}>This chef’s payouts</button></div>
      </aside>}
    </div>
  </div>;
}

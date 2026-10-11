"use client";
import { sessionFetch } from "@/features/auth/api/sessionFetch";
import { chefApiError, ChefError, chefErrorText } from "@/features/chef/lib/chef-errors";
import { ChefAccountingBreakdown } from "@/features/chef/components/chef-accounting-breakdown";
import { AlertTriangle, ChevronDown, Info, RefreshCw } from "lucide-react";
import { ChefNotice, ChefPill, ChefSection, ChefSkeleton, dateTime, formatInr, type ChefTone } from "@/features/chef/components/chef-ui";

import { useEffect, useRef, useState } from "react";
import { chefBalanceSchema, payoutSchema, type ChefBalance } from "@/features/admin/finance/lib/finance-contract";

const PAYOUT_STATE: Record<ChefBalance["recentPayouts"][number]["status"], { label: string; tone: ChefTone }> = {
  RESERVED: { label: "Asked", tone: "active" },
  SUBMITTING: { label: "Sending", tone: "active" },
  PROCESSING: { label: "With the bank", tone: "warning" },
  UNKNOWN: { label: "Checking with bank", tone: "warning" },
  PAID: { label: "Paid", tone: "success" },
  FAILED: { label: "Didn’t go through", tone: "danger" },
  REVERSED: { label: "Returned by bank", tone: "danger" },
  REVIEW_REQUIRED: { label: "Craves is checking", tone: "warning" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
};

export function ChefWithdrawalPanel() {
  const [balance, setBalance] = useState<ChefBalance | null>(null);const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const request = useRef<{requestKey: string; expectedAvailableAmount: string} | null>(null);
  async function load() {
    const response = await sessionFetch("/api/chef/finance/balance", {cache: "no-store"});
    if (!response.ok) throw chefApiError(response, await response.json().catch(() => null), "Your finance balance is unavailable. No amount is being estimated.");
    return chefBalanceSchema.parse(await response.json());
  }
  useEffect(() => {let active = true;load().then(data => {if (active) {setBalance(data);setMessage("");}}).catch(error => {if (active) setMessage(chefErrorText(error, "Balance unavailable"));});return () => {active = false;};}, []);
  async function refresh() {setBusy(true);try {setBalance(await load());setMessage("");} catch (error) {setMessage(chefErrorText(error, "Balance unavailable"));} finally {setBusy(false);}}
  async function withdraw() {
    if (!balance || busy) return;
    if (!request.current) request.current = {requestKey: crypto.randomUUID(), expectedAvailableAmount: balance.available};
    setBusy(true);
    try {
      const response = await sessionFetch("/api/chef/finance/withdrawals", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(request.current)});
      if (!response.ok) throw new ChefError("Withdrawal was not confirmed. Refresh your balance and review any existing request before retrying.", chefApiError(response, await response.json().catch(() => null), "").ref, response.status);
      const result = payoutSchema.parse(await response.json());request.current = null;
      setMessage(`You asked for ${formatInr(result.amount)}. It’s in your bank when it shows Paid below.`);
      setBalance(await load());
    } catch (error) {setMessage(chefErrorText(error instanceof ChefError ? error : new ChefError("The request outcome is uncertain. Do not create another transfer.", "WITHDRAWAL_OUTCOME_UNCERTAIN", 0), ""));}
    finally {setBusy(false);}
  }
  const lastPayout = balance?.recentPayouts[0];
  return <div className="chef-stack">
    <ChefSection title="Money you can take out" labelledBy="chef-balance">
      {!balance ? (
        message ? <ChefNotice icon={AlertTriangle} role="status">{message}</ChefNotice> : <ChefSkeleton className="h-24" />
      ) : <>
        <p className="font-display text-[2.25rem] font-bold leading-none tracking-[-0.03em] text-[#1A1A1A] chef-amount">{formatInr(balance.available)}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-[0.875rem]">
          <div><dt className="text-[#6B6B6B]">Not paid to you yet</dt><dd className="chef-amount mt-0.5 font-semibold">{formatInr(balance.outstanding)}</dd></div>
          <div><dt className="text-[#6B6B6B]">Asked for or paid</dt><dd className="chef-amount mt-0.5 font-semibold">{formatInr(balance.reservedOrPaid)}</dd></div>
        </dl>
        {message ? <div className="mt-4"><ChefNotice icon={Info} role="status">{message}</ChefNotice></div> : null}
        {balance.onHold ? <div className="mt-4"><ChefNotice icon={AlertTriangle} tone="danger"><strong>Your payouts are on hold.</strong> Contact Craves support to resolve it.</ChefNotice></div> : null}
        {!balance.executionEnabled ? <p className="mt-4 text-[0.875rem] text-[#6B6B6B]">New payout requests aren’t available right now. Requests you already made keep their status.</p> : null}
        {balance.manualRequestUsedToday ? <p className="mt-4 text-[0.875rem] text-[#6B6B6B]">You’ve made today’s request. You can request again from {new Date(balance.nextManualRequestAt).toLocaleString("en-IN", {timeZone: "Asia/Kolkata", weekday: "short", hour: "numeric", minute: "2-digit"}).toLowerCase()}.</p> : null}
        <button type="button" className="chef-btn is-primary is-block mt-5" aria-busy={busy} disabled={busy || balance.onHold || balance.manualRequestUsedToday || !balance.executionEnabled || balance.available === "0.00"} onClick={() => void withdraw()}>{busy ? "Asking…" : `Send ${formatInr(balance.available)} to my bank`}</button>
        <p className="mt-3 text-[0.8125rem] leading-5 text-[#6B6B6B]">{balance.payoutMode === "CRAVES_MANUAL" ? "Craves sends the money to your bank." : "Money goes only to your checked bank account."} You can ask once a day. Money you already asked for can’t be asked for again.</p>
      </>}
    </ChefSection>

    {balance ? <ChefSection title="Money sent to your bank" flush labelledBy="chef-payouts" note={lastPayout ? undefined : "Each time you ask, it shows here with what the bank did."}>
      {balance.recentPayouts.length === 0 ? null : <ul className="chef-list border-t border-[#E3E6EA]">{balance.recentPayouts.map(row => {
        const state = PAYOUT_STATE[row.status];
        return <li key={row.id} className="chef-row">
          <span className="chef-row-main">
            <span className="chef-row-title block">{dateTime(row.createdAt)}</span>
            <span className="chef-row-meta block">{row.transferReference ? `Bank reference ${row.transferReference}` : "No bank reference yet"}</span>
          </span>
          <span className="flex flex-col items-end gap-1"><span className="chef-row-value chef-amount">{formatInr(row.amount)}</span><ChefPill tone={state.tone}>{state.label}</ChefPill></span>
        </li>;
      })}</ul>}
    </ChefSection> : null}

    {balance ? <details className="chef-section group">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 font-semibold text-[#1A1A1A] md:px-5 [&::-webkit-details-marker]:hidden">How your balance is worked out<ChevronDown className="h-5 w-5 text-[#6B6B6B] transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
      <div className="border-t border-[#E3E6EA] p-4 md:p-5"><ChefAccountingBreakdown accounting={balance.accounting} /></div>
    </details> : null}

    <div className="flex justify-center"><button type="button" onClick={() => void refresh()} disabled={busy} className="chef-btn is-small"><RefreshCw className="h-4 w-4" aria-hidden="true" />Check balance again</button></div>
  </div>;
}

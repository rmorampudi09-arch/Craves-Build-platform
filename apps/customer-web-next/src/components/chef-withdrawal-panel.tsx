"use client";
import { ChefAccountingBreakdown } from "@/components/chef-accounting-breakdown";

import { useEffect, useRef, useState } from "react";
import { chefBalanceSchema, payoutSchema, type ChefBalance } from "@/lib/finance-contract";

export function ChefWithdrawalPanel() {
  const [balance, setBalance] = useState<ChefBalance | null>(null);const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading your verified available balance…");
  const request = useRef<{requestKey: string; expectedAvailableAmount: string} | null>(null);
  async function load() {
    const response = await fetch("/api/chef/finance/balance", {cache: "no-store"});
    if (!response.ok) throw new Error("Your finance balance is unavailable. No amount is being estimated.");
    return chefBalanceSchema.parse(await response.json());
  }
  useEffect(() => {let active = true;load().then(data => {if (active) {setBalance(data);setMessage("");}}).catch(error => {if (active) setMessage(error instanceof Error ? error.message : "Balance unavailable");});return () => {active = false;};}, []);
  async function refresh() {setBusy(true);try {setBalance(await load());setMessage("");} catch (error) {setMessage(error instanceof Error ? error.message : "Balance unavailable");} finally {setBusy(false);}}
  async function withdraw() {
    if (!balance || busy) return;
    if (!request.current) request.current = {requestKey: crypto.randomUUID(), expectedAvailableAmount: balance.available};
    setBusy(true);
    try {
      const response = await fetch("/api/chef/finance/withdrawals", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(request.current)});
      if (!response.ok) throw new Error("Withdrawal was not confirmed. Refresh your balance and review any existing request before retrying.");
      const result = payoutSchema.parse(await response.json());request.current = null;
      setMessage(`Withdrawal request ${result.id} is ${result.status.toLowerCase()}. Bank payment is confirmed only when marked PAID.`);
      setBalance(await load());
    } catch (error) {setMessage(error instanceof Error ? error.message : "The request outcome is uncertain. Do not create another transfer.");}
    finally {setBusy(false);}
  }
  return <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 text-slate-900">
    {message && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm">{message}</p>}
    {balance && <><div className="grid gap-4 sm:grid-cols-3">{[["Available to request", balance.available], ["Outstanding earnings", balance.outstanding], ["Reserved or already paid", balance.reservedOrPaid]].map(([label, amount]) => <div className="rounded-xl border p-5" key={label}><p className="text-sm text-slate-600">{label}</p><p className="mt-2 text-2xl font-bold">₹{amount}</p></div>)}</div>
      <ChefAccountingBreakdown accounting={balance.accounting} />
      <p className="text-sm">{balance.payoutMode === "CRAVES_MANUAL" ? balance.executionEnabled ? "Eligible payouts are currently processed manually by Craves." : "New manual Craves payment requests are currently unavailable." : "Bank payouts follow the current eligibility and processing settings."} You may request the full available balance once per India calendar day. Held, reserved, uncertain and already-paid amounts cannot be requested again.</p>
      {balance.onHold && <p className="rounded-xl bg-amber-50 p-4 text-sm">Your payout balance is on hold. Contact Craves finance for resolution.</p>}
      {!balance.executionEnabled && <p className="text-sm">A new withdrawal is not currently available. Existing payment requests retain their recorded status.</p>}
      {balance.manualRequestUsedToday && <p className="text-sm">Today’s manual request has been used. Next calendar-day eligibility: {new Date(balance.nextManualRequestAt).toLocaleString("en-IN", {timeZone: "Asia/Kolkata"})} IST.</p>}
      <button type="button" className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-40" disabled={busy || balance.onHold || balance.manualRequestUsedToday || !balance.executionEnabled || balance.available === "0.00"} onClick={() => void withdraw()}>Request ₹{balance.available} available balance</button>
      <h2 className="pt-4 text-xl font-semibold">Your recent requests</h2>{balance.recentPayouts.length === 0 ? <p className="text-sm text-slate-600">No requests in the new finance ledger.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Request</th><th className="p-2">Amount</th><th className="p-2">State</th><th className="p-2">Bank reference</th></tr></thead><tbody>{balance.recentPayouts.map(row => <tr className="border-t" key={row.id}><td className="p-2 font-mono text-xs">{row.id}</td><td className="p-2">₹{row.amount}</td><td className="p-2">{row.status}</td><td className="p-2">{row.transferReference || "Not yet confirmed"}</td></tr>)}</tbody></table></div>}
    </>}
    <button type="button" onClick={() => void refresh()} disabled={busy} className="rounded-xl border px-4 py-2">Refresh balance and status</button>
  </section>;
}

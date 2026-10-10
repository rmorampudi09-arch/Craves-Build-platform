"use client";

import { CHEF_ERROR_MESSAGES, chefApiError, ChefError, chefErrorText } from "@/lib/chef-errors";
import Link from "next/link";
import { Info } from "lucide-react";
import { ChefNotice, ChefSection } from "@/components/chef-ui";
import { useState } from "react";
import { z } from "zod";
import { chefStatementSchema, statementPeriodSchema } from "@/lib/finance-source-contract";
export function ChefLedgerStatementPanel() {
  const [from, setFrom] = useState("");const [to, setTo] = useState("");const [kind, setKind] = useState<"earnings" | "settlements">("earnings");
  const [statement, setStatement] = useState<z.infer<typeof chefStatementSchema> | null>(null);const [message, setMessage] = useState("");const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);setMessage("");setStatement(null);
    try {
      const checked = statementPeriodSchema.safeParse({from, to, kind});
      if (!checked.success) throw new ChefError(CHEF_ERROR_MESSAGES.INVALID_STATEMENT_PERIOD, "INVALID_STATEMENT_PERIOD", 0);
      const period = checked.data;
      const response = await fetch(`/api/chef/finance/statement?${new URLSearchParams(period)}`, {cache: "no-store"});
      if (!response.ok) {
        const failure = chefApiError(response, await response.json().catch(() => null), "Statement data is unavailable. Check the selected dates.");
        throw response.status === 422 ? new ChefError("This period has too many records to show at once. Choose a shorter period.", failure.ref, 422) : failure;
      }
      setStatement(chefStatementSchema.parse(await response.json()));
    } catch (error) {setMessage(chefErrorText(error, "Statement unavailable"));} finally {setBusy(false);}
  }
  const field = "mt-2 block min-h-12 w-full rounded-xl border bg-white px-4 text-base text-[#1A1A1A]";
  const ready = statementPeriodSchema.safeParse({from, to, kind}).success;
  return <ChefSection title="Statement for a period" note="Fees, GST on the Craves fee, tax withheld and what’s still outstanding, for the dates you choose." labelledBy="chef-statement" action={<Link href="/chef/statements" className="chef-btn is-small">PDF statements</Link>}>
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-sm font-semibold">From<input type="date" className={field} value={from} onChange={event => setFrom(event.target.value)} /></label>
        <label className="text-sm font-semibold">To<input type="date" className={field} value={to} onChange={event => setTo(event.target.value)} /><span className="mt-1 block text-[0.8125rem] font-normal text-[#6B6B6B]">Not included in the statement</span></label>
        <label className="text-sm font-semibold">Show<select className={field} value={kind} onChange={event => setKind(event.target.value as "earnings" | "settlements")}><option value="earnings">Earnings and fees</option><option value="settlements">Payouts and settlements</option></select></label>
      </div>
      <div><button type="button" aria-busy={busy} disabled={busy || !ready} onClick={() => void load()} className="chef-btn is-primary w-full sm:w-auto">{busy ? "Loading…" : "View statement"}</button></div>
      {message ? <ChefNotice icon={Info} role="status">{message}</ChefNotice> : null}
      {statement ? <div className="grid gap-4">
        <p className="text-[0.8125rem] text-[#6B6B6B]">As of {new Date(statement.asOf).toLocaleString("en-IN", {timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit"})} (India time). Dates use India time.</p>
        {statement.tables.map((table, index) => <div key={index} className="overflow-x-auto rounded-xl border border-[#E3E6EA]">
          <h3 className="border-b border-[#E3E6EA] bg-[#F7F8FA] px-4 py-2.5 text-[0.9375rem] font-semibold">{table.title}</h3>
          <table className="w-full text-left text-[0.875rem]"><thead><tr>{table.columns.map((column, n) => <th key={n} className="whitespace-nowrap px-4 py-2 font-semibold text-[#6B6B6B]">{column}</th>)}</tr></thead><tbody>{table.rows.map((row, n) => <tr key={n} className="border-t border-[#E3E6EA]">{row.map((cell, c) => <td key={c} className="whitespace-nowrap px-4 py-2 tabular-nums">{cell}</td>)}</tr>)}</tbody></table>
          {table.rows.length === 0 && <p className="px-4 py-3 text-[0.875rem] text-[#6B6B6B]">Nothing recorded in this period.</p>}
        </div>)}
        <p className="text-[0.8125rem] leading-5 text-[#6B6B6B]">{statement.notice}</p>
      </div> : null}
    </div>
  </ChefSection>;
}

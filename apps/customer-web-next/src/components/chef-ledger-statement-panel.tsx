"use client";

import { CHEF_ERROR_MESSAGES, chefApiError, ChefError, chefErrorText } from "@/lib/chef-errors";
import Link from "next/link";
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
        throw response.status === 422 ? new ChefError("This period contains too many records. Choose a shorter period; no rows were silently omitted.", failure.ref, 422) : failure;
      }
      setStatement(chefStatementSchema.parse(await response.json()));
    } catch (error) {setMessage(chefErrorText(error, "Statement unavailable"));} finally {setBusy(false);}
  }
  return <section className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-slate-900">
    <h2 className="text-xl font-semibold">Your dated ledger statement</h2><p className="text-sm text-slate-600">View the original fee, GST on the Craves fee, other reviewed withholding and the outstanding-liability reconciliation. Legacy entries remain separate. Dates use India time and the end date is excluded.</p>
    <div className="grid gap-4 sm:grid-cols-3"><label>From<input type="date" className="mt-2 block w-full rounded-xl border p-3" value={from} onChange={event => setFrom(event.target.value)} /></label><label>To, end exclusive<input type="date" className="mt-2 block w-full rounded-xl border p-3" value={to} onChange={event => setTo(event.target.value)} /></label><label>Statement type<select className="mt-2 block w-full rounded-xl border p-3" value={kind} onChange={event => setKind(event.target.value as "earnings" | "settlements")}><option value="earnings">Earnings and fee breakdown</option><option value="settlements">Payout and settlement history</option></select></label></div>
    <div className="flex flex-wrap gap-3"><button disabled={busy || !statementPeriodSchema.safeParse({from, to, kind}).success} onClick={() => void load()} className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-40">View statement</button><Link href="/chef/statements" className="rounded-xl border px-5 py-3 font-semibold">PDF snapshots and email copies</Link></div>
    {message && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm">{message}</p>}
    {statement && <><p className="text-sm">Snapshot time: {new Date(statement.asOf).toLocaleString("en-IN", {timeZone: "Asia/Kolkata"})} IST.</p>{statement.tables.map((table, index) => <div key={index} className="overflow-x-auto"><h3 className="mb-2 font-semibold">{table.title}</h3><table className="w-full text-left text-sm"><thead><tr>{table.columns.map((column, n) => <th key={n} className="whitespace-nowrap p-2">{column}</th>)}</tr></thead><tbody>{table.rows.map((row, n) => <tr key={n} className="border-t">{row.map((cell, c) => <td key={c} className="p-2">{cell}</td>)}</tr>)}</tbody></table>{table.rows.length === 0 && <p className="py-3 text-sm text-slate-500">No recorded rows in this category for the selected period.</p>}</div>)}<p className="rounded-xl bg-slate-50 p-4 text-sm">{statement.notice}</p></>}
  </section>;
}

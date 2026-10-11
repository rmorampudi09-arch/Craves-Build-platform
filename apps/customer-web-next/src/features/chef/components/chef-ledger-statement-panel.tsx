"use client";
import { sessionFetch } from "@/features/auth/api/sessionFetch";

import { CHEF_ERROR_MESSAGES, chefApiError, ChefError, chefErrorText } from "@/features/chef/lib/chef-errors";
import Link from "next/link";
import { Info } from "lucide-react";
import { ChefChoiceChips, ChefNotice, ChefSection } from "@/features/chef/components/chef-ui";
import { useState } from "react";
import { z } from "zod";
import { chefStatementSchema, statementPeriodSchema } from "@/features/admin/finance/lib/finance-source-contract";
import { STATEMENT_PRESETS, dayAfter, indiaDate, periodLabel, presetPeriod, type StatementPreset } from "@/features/chef/lib/statement-periods";

const KINDS = [{ value: "earnings", label: "Earnings and fees" }, { value: "settlements", label: "Money sent to bank" }] as const;
const DAY_CHOICES: { value: StatementPreset | "custom"; label: string }[] = [...STATEMENT_PRESETS, { value: "custom", label: "Choose dates" }];

export function ChefLedgerStatementPanel() {
  const [preset, setPreset] = useState<StatementPreset | "custom">("this-month");
  const [from, setFrom] = useState("");const [lastDay, setLastDay] = useState("");const [kind, setKind] = useState<"earnings" | "settlements">("earnings");
  // The API takes [from, to): a chosen last day is sent as the day after it.
  const period = preset === "custom" ? {from, to: lastDay ? dayAfter(lastDay) : ""} : presetPeriod(preset, indiaDate());
  const [statement, setStatement] = useState<z.infer<typeof chefStatementSchema> | null>(null);const [message, setMessage] = useState("");const [busy, setBusy] = useState(false);
  // A new choice clears the old summary, so it never sits under chips it doesn't match.
  const choose = <T,>(set: (value: T) => void) => (value: T) => { set(value); setStatement(null); setMessage(""); };
  async function load() {
    setBusy(true);setMessage("");setStatement(null);
    try {
      const checked = statementPeriodSchema.safeParse({...period, kind});
      if (!checked.success) throw new ChefError(CHEF_ERROR_MESSAGES.INVALID_STATEMENT_PERIOD, "INVALID_STATEMENT_PERIOD", 0);
      const response = await sessionFetch(`/api/chef/finance/statement?${new URLSearchParams(checked.data)}`, {cache: "no-store"});
      if (!response.ok) {
        const failure = chefApiError(response, await response.json().catch(() => null), "Statement data is unavailable. Check the selected dates.");
        throw response.status === 422 ? new ChefError("This period has too many records to show at once. Choose a shorter period.", failure.ref, 422) : failure;
      }
      setStatement(chefStatementSchema.parse(await response.json()));
    } catch (error) {setMessage(chefErrorText(error, "Statement unavailable"));} finally {setBusy(false);}
  }
  const field = "mt-2 block min-h-12 w-full rounded-xl border bg-white px-4 text-base font-normal text-[#1A1A1A]";
  const ready = statementPeriodSchema.safeParse({...period, kind}).success;
  return <ChefSection title="Money summary" note="Craves fee, GST on that fee, tax held back and money still to come, for the days you choose." labelledBy="chef-statement" action={<Link href="/chef/statements" className="chef-btn is-small">Get a PDF</Link>}>
    <div className="grid gap-5">
      <ChefChoiceChips legend="What should it show?" name="chef-summary-kind" options={KINDS} value={kind} onChange={choose(setKind)} disabled={busy} />
      <ChefChoiceChips legend="Which days?" name="chef-summary-days" options={DAY_CHOICES} value={preset} onChange={choose(setPreset)} disabled={busy}>
        {preset === "custom" ? <div className="grid gap-3 sm:grid-cols-2">
          <label className="chef-field-label">First day<input type="date" className={field} value={from} max={lastDay || undefined} onChange={event => choose(setFrom)(event.target.value)} /></label>
          <label className="chef-field-label">Last day<input type="date" className={field} value={lastDay} min={from || undefined} onChange={event => choose(setLastDay)(event.target.value)} /></label>
        </div> : null}
        <p className="chef-section-note !text-[0.9375rem]">{ready ? periodLabel(period.from, period.to) : "Choose a first and last day, 31 days at most."}</p>
      </ChefChoiceChips>
      <div><button type="button" aria-busy={busy} disabled={busy || !ready} onClick={() => void load()} className="chef-btn is-primary w-full sm:w-auto">{busy ? "Loading…" : "Show summary"}</button></div>
      {message ? <ChefNotice icon={Info} tone="danger" role="alert">{message}</ChefNotice> : null}
      <p className="sr-only" role="status">{statement ? "Summary ready below." : ""}</p>
      {statement ? <div className="grid gap-4">
        <p className="text-[0.8125rem] text-[#6B6B6B]">Up to date at {new Date(statement.asOf).toLocaleString("en-IN", {timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit"})}.</p>
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

"use client";

import { CHEF_ERROR_MESSAGES, chefApiError, ChefError, chefErrorText } from "@/lib/chef-errors";
import Link from "next/link";
import { Info } from "lucide-react";
import { ChefNotice, ChefSection } from "@/components/chef-ui";
import { useState } from "react";
import { z } from "zod";
import { chefStatementSchema, statementPeriodSchema } from "@/lib/finance-source-contract";
import { STATEMENT_PRESETS, dayAfter, indiaDate, periodLabel, presetPeriod, type StatementPreset } from "@/lib/statement-periods";

const KINDS = [{ value: "earnings", label: "Earnings and fees" }, { value: "settlements", label: "Money sent to bank" }] as const;

export function ChefLedgerStatementPanel() {
  const [preset, setPreset] = useState<StatementPreset | "custom">("this-month");
  const [from, setFrom] = useState("");const [lastDay, setLastDay] = useState("");const [kind, setKind] = useState<"earnings" | "settlements">("earnings");
  // The API takes [from, to): a chosen last day is sent as the day after it.
  const period = preset === "custom" ? {from, to: lastDay ? dayAfter(lastDay) : ""} : presetPeriod(preset, indiaDate());
  const [statement, setStatement] = useState<z.infer<typeof chefStatementSchema> | null>(null);const [message, setMessage] = useState("");const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);setMessage("");setStatement(null);
    try {
      const checked = statementPeriodSchema.safeParse({...period, kind});
      if (!checked.success) throw new ChefError(CHEF_ERROR_MESSAGES.INVALID_STATEMENT_PERIOD, "INVALID_STATEMENT_PERIOD", 0);
      const response = await fetch(`/api/chef/finance/statement?${new URLSearchParams(checked.data)}`, {cache: "no-store"});
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
      <fieldset className="grid gap-2">
        <legend className="chef-field-label">What should it show?</legend>
        <div className="chef-chips is-wrap">{KINDS.map(option => <button key={option.value} type="button" className="chef-chip" aria-pressed={kind === option.value} disabled={busy} onClick={() => setKind(option.value)}>{option.label}</button>)}</div>
      </fieldset>
      <fieldset className="grid gap-2">
        <legend className="chef-field-label">Which days?</legend>
        <div className="chef-chips is-wrap">
          {STATEMENT_PRESETS.map(option => <button key={option.value} type="button" className="chef-chip" aria-pressed={preset === option.value} disabled={busy} onClick={() => setPreset(option.value)}>{option.label}</button>)}
          <button type="button" className="chef-chip" aria-pressed={preset === "custom"} disabled={busy} onClick={() => setPreset("custom")}>Choose dates</button>
        </div>
        {preset === "custom" ? <div className="grid gap-3 sm:grid-cols-2">
          <label className="chef-field-label">First day<input type="date" className={field} value={from} max={lastDay || undefined} onChange={event => setFrom(event.target.value)} /></label>
          <label className="chef-field-label">Last day<input type="date" className={field} value={lastDay} min={from || undefined} onChange={event => setLastDay(event.target.value)} /></label>
        </div> : null}
        <p className="chef-section-note !text-[0.9375rem]">{ready ? periodLabel(period.from, period.to) : "Choose a first and last day, up to 31 days apart."}</p>
      </fieldset>
      <div><button type="button" aria-busy={busy} disabled={busy || !ready} onClick={() => void load()} className="chef-btn is-primary w-full sm:w-auto">{busy ? "Loading…" : "Show summary"}</button></div>
      {message ? <ChefNotice icon={Info} role="status">{message}</ChefNotice> : null}
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

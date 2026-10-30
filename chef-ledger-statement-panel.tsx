"use client";
import { sessionFetch } from "@/shared/lib/session-fetch";

import { CHEF_ERROR_MESSAGES, chefApiError, ChefError, chefErrorText } from "@/features/chef/lib/chef-errors";
import { Info } from "lucide-react";
import { ChefChoiceChips, ChefNotice, ChefSection } from "@/features/chef/components/chef-ui";
import { useState } from "react";
import { z } from "zod";
import { chefStatementSchema, statementPeriodSchema } from "@/features/admin/finance/lib/finance-source-contract";
import { dayAfter, indiaDate, periodLabel, presetPeriod, statementPresets, type StatementPreset } from "@/features/chef/lib/statement-periods";
import { format, messages } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";

const TEXT = messages({
  en: {
    earnings: "Earnings and fees", settlements: "Money sent to bank", chooseDates: "Choose dates",
    title: "Money summary", note: "Craves fee, GST on that fee, tax held back and money still to come, for the days you choose.",
    what: "What should it show?", days: "Which days?", firstDay: "First day", lastDay: "Last day",
    hint: "Choose a first and last day, 31 days at most.", loading: "Loading…", show: "Show summary", ready: "Summary ready below.",
    asOf: "Up to date at {time}.", nothing: "Nothing recorded in this period.",
    unavailable: "Statement data is unavailable. Check the selected dates.",
    tooMany: "This period has too many records to show at once. Choose a shorter period.",
    failed: "Statement unavailable", invalidPeriod: CHEF_ERROR_MESSAGES.INVALID_STATEMENT_PERIOD,
  },
  te: {
    earnings: "సంపాదన, ఫీజులు", settlements: "బ్యాంక్‌కు పంపిన డబ్బు", chooseDates: "తేదీలు ఎంచుకోండి",
    title: "డబ్బు సారాంశం", note: "మీరు ఎంచుకున్న రోజులకు Craves ఫీజు, ఆ ఫీజుపై GST, పన్ను కోత, ఇంకా రావలసిన డబ్బు.",
    what: "ఏం చూపించాలి?", days: "ఏ రోజులు?", firstDay: "మొదటి రోజు", lastDay: "చివరి రోజు",
    hint: "మొదటి, చివరి రోజు ఎంచుకోండి — 31 రోజుల వరకు.", loading: "లోడ్ అవుతోంది…", show: "సారాంశం చూపించండి", ready: "సారాంశం కింద సిద్ధంగా ఉంది.",
    asOf: "{time} వరకు అప్‌డేట్ అయింది.", nothing: "ఈ రోజుల్లో ఏమీ నమోదు కాలేదు.",
    unavailable: "స్టేట్‌మెంట్ వివరాలు అందుబాటులో లేవు. ఎంచుకున్న తేదీలు చూడండి.",
    tooMany: "ఈ రోజుల్లో చాలా ఎక్కువ వివరాలు ఉన్నాయి. తక్కువ రోజులు ఎంచుకోండి.",
    failed: "స్టేట్‌మెంట్ అందుబాటులో లేదు", invalidPeriod: "సరైన రోజులు ఎంచుకోండి: మొదటి తేదీ చివరి తేదీ కంటే ముందు ఉండాలి.",
  },
  kn: {
    earnings: "ಗಳಿಕೆ ಮತ್ತು ಶುಲ್ಕಗಳು", settlements: "ಬ್ಯಾಂಕ್‌ಗೆ ಕಳುಹಿಸಿದ ಹಣ", chooseDates: "ದಿನಾಂಕ ಆಯ್ಕೆಮಾಡಿ",
    title: "ಹಣದ ಸಾರಾಂಶ", note: "ನೀವು ಆಯ್ಕೆಮಾಡಿದ ದಿನಗಳಿಗೆ Craves ಶುಲ್ಕ, ಆ ಶುಲ್ಕದ ಮೇಲಿನ GST, ತೆರಿಗೆ ಕಡಿತ ಮತ್ತು ಇನ್ನೂ ಬರಬೇಕಾದ ಹಣ.",
    what: "ಏನು ತೋರಿಸಬೇಕು?", days: "ಯಾವ ದಿನಗಳು?", firstDay: "ಮೊದಲ ದಿನ", lastDay: "ಕೊನೆಯ ದಿನ",
    hint: "ಮೊದಲ ಮತ್ತು ಕೊನೆಯ ದಿನ ಆಯ್ಕೆಮಾಡಿ — ಗರಿಷ್ಠ 31 ದಿನಗಳು.", loading: "ಲೋಡ್ ಆಗುತ್ತಿದೆ…", show: "ಸಾರಾಂಶ ತೋರಿಸಿ", ready: "ಸಾರಾಂಶ ಕೆಳಗೆ ಸಿದ್ಧವಾಗಿದೆ.",
    asOf: "{time} ರವರೆಗೆ ಅಪ್‌ಡೇಟ್ ಆಗಿದೆ.", nothing: "ಈ ದಿನಗಳಲ್ಲಿ ಏನೂ ದಾಖಲಾಗಿಲ್ಲ.",
    unavailable: "ಸ್ಟೇಟ್‌ಮೆಂಟ್ ವಿವರಗಳು ಲಭ್ಯವಿಲ್ಲ. ಆಯ್ಕೆಮಾಡಿದ ದಿನಾಂಕಗಳನ್ನು ನೋಡಿ.",
    tooMany: "ಈ ದಿನಗಳಲ್ಲಿ ತುಂಬಾ ಹೆಚ್ಚು ದಾಖಲೆಗಳಿವೆ. ಕಡಿಮೆ ದಿನಗಳನ್ನು ಆಯ್ಕೆಮಾಡಿ.",
    failed: "ಸ್ಟೇಟ್‌ಮೆಂಟ್ ಲಭ್ಯವಿಲ್ಲ", invalidPeriod: "ಸರಿಯಾದ ದಿನಗಳನ್ನು ಆಯ್ಕೆಮಾಡಿ: ಮೊದಲ ದಿನಾಂಕ ಕೊನೆಯ ದಿನಾಂಕಕ್ಕಿಂತ ಮೊದಲು ಇರಬೇಕು.",
  },
});

/** The numbers on screen; it sits under "Make a PDF" on Statements, so every PDF is made in one place. */
export function ChefLedgerStatementPanel() {
  const text = useText(TEXT);
  const { language } = useLanguage();
  const kinds = [{ value: "earnings", label: text.earnings }, { value: "settlements", label: text.settlements }] as const;
  const dayChoices: { value: StatementPreset | "custom"; label: string }[] = [...statementPresets(language), { value: "custom", label: text.chooseDates }];
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
      if (!checked.success) throw new ChefError(text.invalidPeriod, "INVALID_STATEMENT_PERIOD", 0);
      const response = await sessionFetch(`/api/chef/finance/statement?${new URLSearchParams(checked.data)}`, {cache: "no-store"});
      if (!response.ok) {
        const failure = chefApiError(response, await response.json().catch(() => null), text.unavailable);
        throw response.status === 422 ? new ChefError(text.tooMany, failure.ref, 422) : failure;
      }
      setStatement(chefStatementSchema.parse(await response.json()));
    } catch (error) {setMessage(chefErrorText(error, text.failed));} finally {setBusy(false);}
  }
  const field = "mt-2 block min-h-12 w-full rounded-xl border bg-white px-4 text-base font-normal text-[#1A1A1A]";
  const ready = statementPeriodSchema.safeParse({...period, kind}).success;
  return <ChefSection title={text.title} note={text.note} labelledBy="chef-statement">
    <div className="grid gap-5">
      <ChefChoiceChips legend={text.what} name="chef-summary-kind" options={kinds} value={kind} onChange={choose(setKind)} disabled={busy} />
      <ChefChoiceChips legend={text.days} name="chef-summary-days" options={dayChoices} value={preset} onChange={choose(setPreset)} disabled={busy}>
        {preset === "custom" ? <div className="grid gap-3 sm:grid-cols-2">
          <label className="chef-field-label">{text.firstDay}<input type="date" className={field} value={from} max={lastDay || undefined} onChange={event => choose(setFrom)(event.target.value)} /></label>
          <label className="chef-field-label">{text.lastDay}<input type="date" className={field} value={lastDay} min={from || undefined} onChange={event => choose(setLastDay)(event.target.value)} /></label>
        </div> : null}
        <p className="chef-section-note !text-[0.9375rem]">{ready ? periodLabel(period.from, period.to) : text.hint}</p>
      </ChefChoiceChips>
      <div><button type="button" aria-busy={busy} disabled={busy || !ready} onClick={() => void load()} className="chef-btn is-primary w-full sm:w-auto">{busy ? text.loading : text.show}</button></div>
      {message ? <ChefNotice icon={Info} tone="danger" role="alert">{message}</ChefNotice> : null}
      <p className="sr-only" role="status">{statement ? text.ready : ""}</p>
      {statement ? <div className="grid gap-4">
        <p className="text-[0.8125rem] text-[#6B6B6B]">{format(text.asOf, {time: new Date(statement.asOf).toLocaleString("en-IN", {timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit"})})}</p>
        {/* Tables, columns and the notice come from the finance service as it writes them. */}
        {statement.tables.map((table, index) => <div key={index} className="overflow-x-auto rounded-xl border border-[#E3E6EA]">
          <h3 className="border-b border-[#E3E6EA] bg-[#F7F8FA] px-4 py-2.5 text-[0.9375rem] font-semibold">{table.title}</h3>
          <table className="w-full text-left text-[0.875rem]"><thead><tr>{table.columns.map((column, n) => <th key={n} className="whitespace-nowrap px-4 py-2 font-semibold text-[#6B6B6B]">{column}</th>)}</tr></thead><tbody>{table.rows.map((row, n) => <tr key={n} className="border-t border-[#E3E6EA]">{row.map((cell, c) => <td key={c} className="whitespace-nowrap px-4 py-2 tabular-nums">{cell}</td>)}</tr>)}</tbody></table>
          {table.rows.length === 0 && <p className="px-4 py-3 text-[0.875rem] text-[#6B6B6B]">{text.nothing}</p>}
        </div>)}
        <p className="text-[0.8125rem] leading-5 text-[#6B6B6B]">{statement.notice}</p>
      </div> : null}
    </div>
  </ChefSection>;
}

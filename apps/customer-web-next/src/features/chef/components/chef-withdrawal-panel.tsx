"use client";
import Link from "next/link";
import { sessionFetch } from "@/features/auth/api/sessionFetch";
import { chefApiError, ChefError, chefErrorText } from "@/features/chef/lib/chef-errors";
import { ChefAccountingBreakdown } from "@/features/chef/components/chef-accounting-breakdown";
import { useChefBank } from "@/features/chef/components/chef-bank-onboarding-panel";
import { AlertTriangle, ChevronDown, ChevronRight, Info, Landmark, RefreshCw } from "lucide-react";
import { ChefFlash, ChefNotice, ChefPill, ChefSection, dateTime, formatInr } from "@/features/chef/components/chef-ui";
import { payoutStatusView } from "@/features/chef/lib/chef-payout-presentation";
import { ChefBalanceSkeleton } from "@/features/chef/components/chef-loading";
import { format, LANGUAGE_NAMES, messages } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";

import { useCallback, useEffect, useRef, useState } from "react";
import { chefBalanceSchema, payoutSchema, type ChefBalance } from "@/features/admin/finance/lib/finance-contract";

const TEXT = messages({
  en: {
    loadFailed: "Your finance balance is unavailable. No amount is being estimated.",
    unavailable: "Balance unavailable",
    notConfirmed: "Withdrawal was not confirmed. Refresh your balance and review any existing request before retrying.",
    uncertain: "The request outcome is uncertain. Do not create another transfer.",
    asked: "You asked for {amount}. It’s in your bank when it shows Paid below.",
    askedCompact: "You asked for {amount}. It’s in your bank when Payout history shows Paid.",
    title: "Money you can take out",
    notPaid: "Not paid to you yet",
    reserved: "Asked for or paid",
    holdTitle: "Your payouts are on hold.",
    holdText: "Contact Craves support to resolve it.",
    help: "Help & support",
    noBank: "Add your bank account to get paid.",
    addBank: "Add bank account",
    bankChecking: "Your bank account is being checked. Payouts start once it is checked.",
    bankAttention: "Your bank account needs your attention.",
    bankAccount: "Bank account",
    paused: "New payout requests aren’t available right now. Requests you already made keep their status.",
    usedToday: "You’ve made today’s request. You can request again from {when}.",
    asking: "Asking…",
    send: "Send {amount} to my bank",
    sendsManual: "Craves sends the money to your bank.",
    sendsChecked: "Money goes only to your checked bank account.",
    rules: "You can ask once a day. Money you already asked for can’t be asked for again.",
    sentTitle: "Money sent to your bank",
    sentNote: "Each time you ask, it shows here with what the bank did.",
    bankReference: "Bank reference {ref}",
    noReference: "No bank reference yet",
    workedOut: "How your balance is worked out",
    checkAgain: "Check balance again",
    more: "Payouts and how it’s worked out",
  },
  te: {
    loadFailed: "మీ బ్యాలెన్స్ ఇప్పుడు చూపించలేకపోతున్నాం. అంచనాగా ఏ మొత్తమూ చూపించడం లేదు.",
    unavailable: "బ్యాలెన్స్ అందుబాటులో లేదు",
    notConfirmed: "డబ్బు తీసుకోవడం నిర్ధారణ కాలేదు. మళ్లీ ప్రయత్నించే ముందు మీ బ్యాలెన్స్ మళ్లీ చూడండి, ఇప్పటికే అడిగినది ఏదైనా ఉందేమో చూడండి.",
    uncertain: "మీ అభ్యర్థన జరిగిందో లేదో తెలియదు. ఇంకో బదిలీ చేయవద్దు.",
    asked: "మీరు {amount} అడిగారు. కింద 'చెల్లించాం' అని కనిపించినప్పుడు డబ్బు మీ బ్యాంక్‌లో ఉంటుంది.",
    askedCompact: "మీరు {amount} అడిగారు. చెల్లింపుల చరిత్రలో 'చెల్లించాం' అని కనిపించినప్పుడు డబ్బు మీ బ్యాంక్‌లో ఉంటుంది.",
    title: "మీరు తీసుకోగల డబ్బు",
    notPaid: "మీకు ఇంకా చెల్లించనిది",
    reserved: "అడిగినది లేదా చెల్లించినది",
    holdTitle: "మీ చెల్లింపులు ఆపి ఉంచారు.",
    holdText: "దీన్ని సరిచేయడానికి Craves సపోర్ట్‌ను సంప్రదించండి.",
    help: "సహాయం",
    noBank: "డబ్బు పొందడానికి మీ బ్యాంక్ ఖాతా జోడించండి.",
    addBank: "బ్యాంక్ ఖాతా జోడించండి",
    bankChecking: "మీ బ్యాంక్ ఖాతాను చెక్ చేస్తున్నాం. చెక్ అయిన తర్వాత చెల్లింపులు మొదలవుతాయి.",
    bankAttention: "మీ బ్యాంక్ ఖాతాలో మీరు చూడాల్సింది ఉంది.",
    bankAccount: "బ్యాంక్ ఖాతా",
    paused: "ఇప్పుడు కొత్తగా డబ్బు అడగడం కుదరదు. మీరు ఇప్పటికే అడిగినవి వాటి స్థితిలోనే ఉంటాయి.",
    usedToday: "ఈరోజు మీరు ఇప్పటికే అడిగారు. {when} నుండి మళ్లీ అడగవచ్చు.",
    asking: "అడుగుతున్నాం…",
    send: "{amount} నా బ్యాంక్‌కు పంపండి",
    sendsManual: "Craves డబ్బును మీ బ్యాంక్‌కు పంపుతుంది.",
    sendsChecked: "చెక్ చేసిన మీ బ్యాంక్ ఖాతాకు మాత్రమే డబ్బు వెళ్తుంది.",
    rules: "రోజుకు ఒకసారి అడగవచ్చు. ఇప్పటికే అడిగిన డబ్బును మళ్లీ అడగలేరు.",
    sentTitle: "మీ బ్యాంక్‌కు పంపిన డబ్బు",
    sentNote: "మీరు అడిగిన ప్రతిసారీ, బ్యాంక్ ఏం చేసిందో ఇక్కడ కనిపిస్తుంది.",
    bankReference: "బ్యాంక్ రిఫరెన్స్ {ref}",
    noReference: "ఇంకా బ్యాంక్ రిఫరెన్స్ లేదు",
    workedOut: "మీ బ్యాలెన్స్ ఎలా లెక్కించారు",
    checkAgain: "బ్యాలెన్స్ మళ్లీ చూడండి",
    more: "చెల్లింపులు, లెక్క ఎలా వేశారు",
  },
  kn: {
    loadFailed: "ನಿಮ್ಮ ಬ್ಯಾಲೆನ್ಸ್ ಈಗ ತೋರಿಸಲು ಆಗುತ್ತಿಲ್ಲ. ಅಂದಾಜು ಮೊತ್ತವನ್ನು ತೋರಿಸುತ್ತಿಲ್ಲ.",
    unavailable: "ಬ್ಯಾಲೆನ್ಸ್ ಲಭ್ಯವಿಲ್ಲ",
    notConfirmed: "ಹಣ ತೆಗೆಯುವುದು ಖಚಿತವಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸುವ ಮೊದಲು ನಿಮ್ಮ ಬ್ಯಾಲೆನ್ಸ್ ಮತ್ತೆ ನೋಡಿ, ಈಗಾಗಲೇ ಕೇಳಿದ್ದು ಏನಾದರೂ ಇದೆಯೇ ನೋಡಿ.",
    uncertain: "ನಿಮ್ಮ ಕೋರಿಕೆ ಆಗಿದೆಯೋ ಇಲ್ಲವೋ ಖಚಿತವಿಲ್ಲ. ಇನ್ನೊಂದು ವರ್ಗಾವಣೆ ಮಾಡಬೇಡಿ.",
    asked: "ನೀವು {amount} ಕೇಳಿದ್ದೀರಿ. ಕೆಳಗೆ 'ಪಾವತಿಸಲಾಗಿದೆ' ಎಂದು ಕಂಡಾಗ ಹಣ ನಿಮ್ಮ ಬ್ಯಾಂಕ್‌ನಲ್ಲಿರುತ್ತದೆ.",
    askedCompact: "ನೀವು {amount} ಕೇಳಿದ್ದೀರಿ. ಪಾವತಿ ಇತಿಹಾಸದಲ್ಲಿ 'ಪಾವತಿಸಲಾಗಿದೆ' ಎಂದು ಕಂಡಾಗ ಹಣ ನಿಮ್ಮ ಬ್ಯಾಂಕ್‌ನಲ್ಲಿರುತ್ತದೆ.",
    title: "ನೀವು ತೆಗೆದುಕೊಳ್ಳಬಹುದಾದ ಹಣ",
    notPaid: "ನಿಮಗೆ ಇನ್ನೂ ಪಾವತಿಸದ್ದು",
    reserved: "ಕೇಳಿದ್ದು ಅಥವಾ ಪಾವತಿಸಿದ್ದು",
    holdTitle: "ನಿಮ್ಮ ಪಾವತಿಗಳನ್ನು ತಡೆಹಿಡಿಯಲಾಗಿದೆ.",
    holdText: "ಇದನ್ನು ಸರಿಪಡಿಸಲು Craves ಸಪೋರ್ಟ್ ಅನ್ನು ಸಂಪರ್ಕಿಸಿ.",
    help: "ಸಹಾಯ",
    noBank: "ಹಣ ಪಡೆಯಲು ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ಖಾತೆ ಸೇರಿಸಿ.",
    addBank: "ಬ್ಯಾಂಕ್ ಖಾತೆ ಸೇರಿಸಿ",
    bankChecking: "ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ಖಾತೆಯನ್ನು ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ. ಪರಿಶೀಲನೆ ಮುಗಿದ ನಂತರ ಪಾವತಿಗಳು ಶುರುವಾಗುತ್ತವೆ.",
    bankAttention: "ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ಖಾತೆಯಲ್ಲಿ ನೀವು ನೋಡಬೇಕಾದದ್ದಿದೆ.",
    bankAccount: "ಬ್ಯಾಂಕ್ ಖಾತೆ",
    paused: "ಈಗ ಹೊಸದಾಗಿ ಹಣ ಕೇಳಲು ಆಗುವುದಿಲ್ಲ. ನೀವು ಈಗಾಗಲೇ ಕೇಳಿದವು ಅದೇ ಸ್ಥಿತಿಯಲ್ಲಿರುತ್ತವೆ.",
    usedToday: "ಇಂದಿನ ಕೋರಿಕೆಯನ್ನು ನೀವು ಮಾಡಿದ್ದೀರಿ. {when} ರಿಂದ ಮತ್ತೆ ಕೇಳಬಹುದು.",
    asking: "ಕೇಳಲಾಗುತ್ತಿದೆ…",
    send: "{amount} ನನ್ನ ಬ್ಯಾಂಕ್‌ಗೆ ಕಳುಹಿಸಿ",
    sendsManual: "Craves ಹಣವನ್ನು ನಿಮ್ಮ ಬ್ಯಾಂಕ್‌ಗೆ ಕಳುಹಿಸುತ್ತದೆ.",
    sendsChecked: "ಪರಿಶೀಲಿಸಿದ ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ಖಾತೆಗೆ ಮಾತ್ರ ಹಣ ಹೋಗುತ್ತದೆ.",
    rules: "ದಿನಕ್ಕೆ ಒಮ್ಮೆ ಕೇಳಬಹುದು. ಈಗಾಗಲೇ ಕೇಳಿದ ಹಣವನ್ನು ಮತ್ತೆ ಕೇಳಲು ಆಗುವುದಿಲ್ಲ.",
    sentTitle: "ನಿಮ್ಮ ಬ್ಯಾಂಕ್‌ಗೆ ಕಳುಹಿಸಿದ ಹಣ",
    sentNote: "ನೀವು ಕೇಳಿದ ಪ್ರತಿ ಬಾರಿ, ಬ್ಯಾಂಕ್ ಏನು ಮಾಡಿತು ಎಂಬುದು ಇಲ್ಲಿ ಕಾಣುತ್ತದೆ.",
    bankReference: "ಬ್ಯಾಂಕ್ ರೆಫರೆನ್ಸ್ {ref}",
    noReference: "ಇನ್ನೂ ಬ್ಯಾಂಕ್ ರೆಫರೆನ್ಸ್ ಇಲ್ಲ",
    workedOut: "ನಿಮ್ಮ ಬ್ಯಾಲೆನ್ಸ್ ಹೇಗೆ ಲೆಕ್ಕ ಹಾಕಲಾಗಿದೆ",
    checkAgain: "ಬ್ಯಾಲೆನ್ಸ್ ಮತ್ತೆ ನೋಡಿ",
    more: "ಪಾವತಿಗಳು, ಲೆಕ್ಕ ಹೇಗೆ ಹಾಕಲಾಗಿದೆ",
  },
});

// These bank states wait on the chef, not on a check.
const BANK_NEEDS_CHEF = new Set(["VALIDATION_FAILED", "NAME_MISMATCH", "APPLICANT_ACTION_REQUIRED"]);
const NOTICE_LINK = "chef-btn is-small mt-3";

/** `compact` (the Money tab): the balance and its button, ending with a link to the payouts and the breakdown. */
export function ChefWithdrawalPanel({ compact = false }: { compact?: boolean }) {
  const text = useText(TEXT);
  const { language } = useLanguage();
  const [balance, setBalance] = useState<ChefBalance | null>(null);const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const request = useRef<{requestKey: string; expectedAvailableAmount: string} | null>(null);
  // A hold mostly comes down to the bank account, so the account is read only then.
  const bank = useChefBank(balance?.onHold === true);
  const load = useCallback(async () => {
    const response = await sessionFetch("/api/chef/finance/balance", {cache: "no-store"});
    if (!response.ok) throw chefApiError(response, await response.json().catch(() => null), text.loadFailed);
    return chefBalanceSchema.parse(await response.json());
  }, [text]);
  useEffect(() => {let active = true;load().then(data => {if (active) {setBalance(data);setMessage("");}}).catch(error => {if (active) setMessage(chefErrorText(error, text.unavailable));});return () => {active = false;};}, [load, text.unavailable]);
  async function refresh() {setBusy(true);try {setBalance(await load());setMessage("");} catch (error) {setMessage(chefErrorText(error, text.unavailable));} finally {setBusy(false);}}
  async function withdraw() {
    if (!balance || busy) return;
    if (!request.current) request.current = {requestKey: crypto.randomUUID(), expectedAvailableAmount: balance.available};
    setBusy(true);setNotice("");
    try {
      const response = await sessionFetch("/api/chef/finance/withdrawals", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(request.current)});
      if (!response.ok) throw new ChefError(text.notConfirmed, chefApiError(response, await response.json().catch(() => null), "").ref, response.status);
      const result = payoutSchema.parse(await response.json());request.current = null;
      setMessage("");setNotice(format(compact ? text.askedCompact : text.asked, {amount: formatInr(result.amount)}));
      setBalance(await load());
    } catch (error) {setMessage(chefErrorText(error instanceof ChefError ? error : new ChefError(text.uncertain, "WITHDRAWAL_OUTCOME_UNCERTAIN", 0), ""));}
    finally {setBusy(false);}
  }
  const lastPayout = balance?.recentPayouts[0];
  // Why payouts are on hold, from the bank account; nothing until it has been read, so the words don't jump.
  const hold = bank === undefined ? null
    : bank?.state === "NOT_SUBMITTED" ? <ChefNotice icon={Landmark}><p>{text.noBank}</p><Link href="/chef/bank" className={NOTICE_LINK}>{text.addBank}</Link></ChefNotice>
    : bank && BANK_NEEDS_CHEF.has(bank.state) ? <ChefNotice icon={AlertTriangle} tone="danger"><p>{text.bankAttention}</p><Link href="/chef/bank" className={NOTICE_LINK}>{text.bankAccount}</Link></ChefNotice>
    : bank && bank.state !== "VERIFIED" ? <ChefNotice icon={Info}><p>{text.bankChecking}</p></ChefNotice>
    : <ChefNotice icon={AlertTriangle} tone="danger"><p><strong>{text.holdTitle}</strong> {text.holdText}</p><Link href="/chef/support" className={NOTICE_LINK}>{text.help}</Link></ChefNotice>;
  return <div className="chef-stack">
    <ChefSection title={text.title} labelledBy="chef-balance">
      {!balance ? (
        message ? <ChefNotice icon={AlertTriangle} role="status">{message}</ChefNotice> : <ChefBalanceSkeleton />
      ) : <>
        <p className="font-display text-[2.25rem] font-bold leading-none tracking-[-0.03em] text-[#1A1A1A] chef-amount">{formatInr(balance.available)}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-[0.875rem]">
          <div><dt className="text-[#6B6B6B]">{text.notPaid}</dt><dd className="chef-amount mt-0.5 font-semibold">{formatInr(balance.outstanding)}</dd></div>
          <div><dt className="text-[#6B6B6B]">{text.reserved}</dt><dd className="chef-amount mt-0.5 font-semibold">{formatInr(balance.reservedOrPaid)}</dd></div>
        </dl>
        {message ? <div className="mt-4"><ChefNotice icon={Info} role="status">{message}</ChefNotice></div> : null}
        {balance.onHold && hold ? <div className="mt-4">{hold}</div> : null}
        {!balance.executionEnabled ? <p className="mt-4 text-[0.875rem] text-[#6B6B6B]">{text.paused}</p> : null}
        {balance.manualRequestUsedToday ? <p className="mt-4 text-[0.875rem] text-[#6B6B6B]">{format(text.usedToday, {when: new Date(balance.nextManualRequestAt).toLocaleString(LANGUAGE_NAMES[language].locale, {timeZone: "Asia/Kolkata", weekday: "short", hour: "numeric", minute: "2-digit"}).toLowerCase()})}</p> : null}
        <button type="button" className="chef-btn is-primary is-block mt-5" aria-busy={busy} disabled={busy || balance.onHold || balance.manualRequestUsedToday || !balance.executionEnabled || balance.available === "0.00"} onClick={() => void withdraw()}>{busy ? text.asking : format(text.send, {amount: formatInr(balance.available)})}</button>
        <p className="mt-3 text-[0.8125rem] leading-5 text-[#6B6B6B]">{balance.payoutMode === "CRAVES_MANUAL" ? text.sendsManual : text.sendsChecked} {text.rules}</p>
      </>}
      {compact ? <Link href="/chef/finance" className="mt-4 flex min-h-11 items-center justify-between gap-3 border-t border-[#E3E6EA] pt-3 font-semibold text-[#1A1A1A] no-underline">{text.more}<ChevronRight className="chef-chevron h-5 w-5" aria-hidden="true" /></Link> : null}
    </ChefSection>

    {!compact && balance ? <ChefSection title={text.sentTitle} flush labelledBy="chef-payouts" note={lastPayout ? undefined : text.sentNote}>
      {balance.recentPayouts.length === 0 ? null : <ul className="chef-list border-t border-[#E3E6EA]">{balance.recentPayouts.map(row => {
        const state = payoutStatusView(row.status, language);
        return <li key={row.id} className="chef-row">
          <span className="chef-row-main">
            <span className="chef-row-title block">{dateTime(row.createdAt)}</span>
            <span className="chef-row-meta block">{row.transferReference ? format(text.bankReference, {ref: row.transferReference}) : text.noReference}</span>
          </span>
          <span className="flex flex-col items-end gap-1"><span className="chef-row-value chef-amount">{formatInr(row.amount)}</span><ChefPill tone={state.tone}>{state.label}</ChefPill></span>
        </li>;
      })}</ul>}
    </ChefSection> : null}

    {!compact && balance ? <details className="chef-section group">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 font-semibold text-[#1A1A1A] md:px-5 [&::-webkit-details-marker]:hidden">{text.workedOut}<ChevronDown className="h-5 w-5 text-[#6B6B6B] transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
      <div className="border-t border-[#E3E6EA] p-4 md:p-5"><ChefAccountingBreakdown accounting={balance.accounting} /></div>
    </details> : null}

    {/* The Money tab keeps this for when something went wrong; the full page always has it. */}
    {!compact || message ? <div className="flex justify-center"><button type="button" onClick={() => void refresh()} disabled={busy} className="chef-btn is-small"><RefreshCw className="h-4 w-4" aria-hidden="true" />{text.checkAgain}</button></div> : null}
    <ChefFlash message={notice} onClose={() => setNotice("")} />
  </div>;
}

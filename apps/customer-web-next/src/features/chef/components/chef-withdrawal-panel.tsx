"use client";
import Link from "next/link";
import { sessionFetch } from "@/shared/lib/session-fetch";
import { chefApiError, ChefError, chefErrorText } from "@/features/chef/lib/chef-errors";
import { ChefAccountingBreakdown } from "@/features/chef/components/chef-accounting-breakdown";
import { useChefBank } from "@/features/chef/components/chef-bank-onboarding-panel";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Info, Landmark, RefreshCw } from "lucide-react";
import { ChefNotice, ChefPill, ChefSection, dateTime, formatInr } from "@/features/chef/components/chef-ui";
import { bankLine, payoutStatusView, withdrawalRefused } from "@/features/chef/lib/chef-payout-presentation";
import { ChefBalanceSkeleton } from "@/features/chef/components/chef-loading";
import { format, LANGUAGE_NAMES, messages } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";
import { Sheet, secondaryActionClass } from "@/shared/ui/overlays/overlay";

import { useCallback, useEffect, useRef, useState } from "react";
import { chefBalanceSchema, payoutSchema, type ChefBalance } from "@/features/admin/finance/lib/finance-contract";

const TEXT = messages({
  en: {
    loadFailed: "Your finance balance is unavailable. No amount is being estimated.",
    unavailable: "Balance unavailable",
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
    withdraw: "Withdraw {amount}",
    sendsManual: "Craves sends the money to your bank.",
    sendsChecked: "Money goes only to your checked bank account.",
    rules: "You can ask once a day. Money you already asked for can’t be asked for again.",
    sheetTitle: "Withdraw to your bank",
    amount: "Amount",
    fullBalance: "Your full available balance",
    accountEnding: "Account ••{lastFour}",
    verified: "Verified",
    toVerified: "We’ll send it to your verified bank account.",
    sheetNote: "You can withdraw once a day. Payout history shows when it reaches your bank.",
    cancel: "Cancel",
    sending: "Sending…",
    onItsWay: "{amount} is on its way",
    sentTo: "Sent to {bank}. Track it in Payout history.",
    track: "Track it in Payout history.",
    failedTitle: "Your withdrawal didn’t go through",
    balanceChanged: "Your balance changed. Check the amount and try again.",
    oncePerDay: "You can withdraw once a day. Try again tomorrow.",
    sendFailed: "We couldn’t send your withdrawal. Please try again.",
    uncertainTitle: "We couldn’t confirm your withdrawal",
    uncertainText: "Please don’t ask again. Check its status first.",
    checkStatus: "Check withdrawal status",
    checking: "Checking…",
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
    withdraw: "{amount} తీసుకోండి",
    sendsManual: "Craves డబ్బును మీ బ్యాంక్‌కు పంపుతుంది.",
    sendsChecked: "చెక్ చేసిన మీ బ్యాంక్ ఖాతాకు మాత్రమే డబ్బు వెళ్తుంది.",
    rules: "రోజుకు ఒకసారి అడగవచ్చు. ఇప్పటికే అడిగిన డబ్బును మళ్లీ అడగలేరు.",
    sheetTitle: "మీ బ్యాంక్‌కు డబ్బు తీసుకోండి",
    amount: "మొత్తం",
    fullBalance: "మీరు తీసుకోగల మొత్తం డబ్బు",
    accountEnding: "ఖాతా ••{lastFour}",
    verified: "ధృవీకరించబడింది",
    toVerified: "ధృవీకరించిన మీ బ్యాంక్ ఖాతాకు పంపుతాం.",
    sheetNote: "రోజుకు ఒకసారి డబ్బు తీసుకోవచ్చు. డబ్బు మీ బ్యాంక్‌కు ఎప్పుడు చేరిందో చెల్లింపుల చరిత్రలో కనిపిస్తుంది.",
    cancel: "రద్దు చేయండి",
    sending: "పంపుతున్నాం…",
    onItsWay: "{amount} మీ బ్యాంక్‌కు వెళ్తోంది",
    sentTo: "{bank} కు పంపాం. చెల్లింపుల చరిత్రలో చూడండి.",
    track: "చెల్లింపుల చరిత్రలో చూడండి.",
    failedTitle: "మీ డబ్బు పంపడం పూర్తి కాలేదు",
    balanceChanged: "మీ బ్యాలెన్స్ మారింది. మొత్తం చూసి మళ్లీ ప్రయత్నించండి.",
    oncePerDay: "రోజుకు ఒకసారి మాత్రమే డబ్బు తీసుకోవచ్చు. రేపు మళ్లీ ప్రయత్నించండి.",
    sendFailed: "మీ డబ్బు పంపలేకపోయాం. దయచేసి మళ్లీ ప్రయత్నించండి.",
    uncertainTitle: "మీ డబ్బు వెళ్లిందో లేదో నిర్ధారించలేకపోయాం",
    uncertainText: "దయచేసి మళ్లీ అడగవద్దు. ముందు దాని స్థితి చూడండి.",
    checkStatus: "డబ్బు స్థితి చూడండి",
    checking: "చూస్తున్నాం…",
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
    withdraw: "{amount} ತೆಗೆದುಕೊಳ್ಳಿ",
    sendsManual: "Craves ಹಣವನ್ನು ನಿಮ್ಮ ಬ್ಯಾಂಕ್‌ಗೆ ಕಳುಹಿಸುತ್ತದೆ.",
    sendsChecked: "ಪರಿಶೀಲಿಸಿದ ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ಖಾತೆಗೆ ಮಾತ್ರ ಹಣ ಹೋಗುತ್ತದೆ.",
    rules: "ದಿನಕ್ಕೆ ಒಮ್ಮೆ ಕೇಳಬಹುದು. ಈಗಾಗಲೇ ಕೇಳಿದ ಹಣವನ್ನು ಮತ್ತೆ ಕೇಳಲು ಆಗುವುದಿಲ್ಲ.",
    sheetTitle: "ನಿಮ್ಮ ಬ್ಯಾಂಕ್‌ಗೆ ಹಣ ತೆಗೆದುಕೊಳ್ಳಿ",
    amount: "ಮೊತ್ತ",
    fullBalance: "ನೀವು ತೆಗೆದುಕೊಳ್ಳಬಹುದಾದ ಪೂರ್ತಿ ಹಣ",
    accountEnding: "ಖಾತೆ ••{lastFour}",
    verified: "ಪರಿಶೀಲಿಸಲಾಗಿದೆ",
    toVerified: "ಪರಿಶೀಲಿಸಿದ ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ಖಾತೆಗೆ ಕಳುಹಿಸುತ್ತೇವೆ.",
    sheetNote: "ದಿನಕ್ಕೆ ಒಮ್ಮೆ ಹಣ ತೆಗೆದುಕೊಳ್ಳಬಹುದು. ಹಣ ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ಯಾವಾಗ ತಲುಪಿತು ಎಂಬುದು ಪಾವತಿ ಇತಿಹಾಸದಲ್ಲಿ ಕಾಣುತ್ತದೆ.",
    cancel: "ರದ್ದುಮಾಡಿ",
    sending: "ಕಳುಹಿಸುತ್ತಿದ್ದೇವೆ…",
    onItsWay: "{amount} ನಿಮ್ಮ ಬ್ಯಾಂಕ್‌ಗೆ ಹೋಗುತ್ತಿದೆ",
    sentTo: "{bank} ಗೆ ಕಳುಹಿಸಿದ್ದೇವೆ. ಪಾವತಿ ಇತಿಹಾಸದಲ್ಲಿ ನೋಡಿ.",
    track: "ಪಾವತಿ ಇತಿಹಾಸದಲ್ಲಿ ನೋಡಿ.",
    failedTitle: "ನಿಮ್ಮ ಹಣ ಕಳುಹಿಸುವುದು ಪೂರ್ಣವಾಗಲಿಲ್ಲ",
    balanceChanged: "ನಿಮ್ಮ ಬ್ಯಾಲೆನ್ಸ್ ಬದಲಾಗಿದೆ. ಮೊತ್ತ ನೋಡಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    oncePerDay: "ದಿನಕ್ಕೆ ಒಮ್ಮೆ ಮಾತ್ರ ಹಣ ತೆಗೆದುಕೊಳ್ಳಬಹುದು. ನಾಳೆ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    sendFailed: "ನಿಮ್ಮ ಹಣ ಕಳುಹಿಸಲು ಆಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    uncertainTitle: "ನಿಮ್ಮ ಹಣ ಹೋಯಿತೇ ಎಂದು ಖಚಿತಪಡಿಸಲು ಆಗಲಿಲ್ಲ",
    uncertainText: "ದಯವಿಟ್ಟು ಮತ್ತೆ ಕೇಳಬೇಡಿ. ಮೊದಲು ಅದರ ಸ್ಥಿತಿ ನೋಡಿ.",
    checkStatus: "ಹಣದ ಸ್ಥಿತಿ ನೋಡಿ",
    checking: "ನೋಡುತ್ತಿದ್ದೇವೆ…",
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

type Withdrawal = { requestKey: string; expectedAvailableAmount: string };
/** What the last withdrawal came to: sent, a clear no, or no answer (the same request must be checked, never a new one). */
type Outcome = { kind: "sent"; amount: string } | { kind: "failed"; message: string } | { kind: "uncertain" };

/** `compact` (the Earnings tab): the balance and its button, ending with a link to the payouts and the breakdown. */
export function ChefWithdrawalPanel({ compact = false }: { compact?: boolean }) {
  const text = useText(TEXT);
  const { language } = useLanguage();
  const [balance, setBalance] = useState<ChefBalance | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // The withdrawal still waiting for an answer: sent again as it is, with its key, never as a new one.
  const pending = useRef<Withdrawal | null>(null);
  // A ref, because state is a render late: a second tap while one request runs does nothing.
  const sending = useRef(false);
  // The confirm step names the account, and an account that isn't verified stops the button.
  const bank = useChefBank();
  const load = useCallback(async () => {
    const response = await sessionFetch("/api/chef/finance/balance", {cache: "no-store"});
    if (!response.ok) throw chefApiError(response, await response.json().catch(() => null), text.loadFailed);
    return chefBalanceSchema.parse(await response.json());
  }, [text]);
  useEffect(() => {let active = true;load().then(data => {if (active) {setBalance(data);setMessage("");}}).catch(error => {if (active) setMessage(chefErrorText(error, text.unavailable));});return () => {active = false;};}, [load, text.unavailable]);
  async function refresh() {setBusy(true);try {setBalance(await load());setMessage("");} catch (error) {setMessage(chefErrorText(error, text.unavailable));} finally {setBusy(false);}}

  async function send(request: Withdrawal) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    // "We couldn't confirm" stays while its request is checked, so its button shows the progress.
    setOutcome(current => (current?.kind === "uncertain" ? current : null));
    let answered = true;
    try {
      const response = await sessionFetch("/api/chef/finance/withdrawals", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(request)});
      const body: unknown = await response.json().catch(() => null);
      if (response.ok) {
        const payout = payoutSchema.parse(body);
        pending.current = null;
        setOutcome({kind: "sent", amount: payout.amount});
      } else if (withdrawalRefused(response.status)) {
        pending.current = null;
        const words = response.status === 409 ? text.balanceChanged : response.status === 429 ? text.oncePerDay : text.sendFailed;
        setOutcome({kind: "failed", message: chefErrorText(new ChefError(words, chefApiError(response, body, "").ref, response.status), "")});
      } else throw new ChefError("", chefApiError(response, body, "").ref, response.status);
    } catch (error) {
      // No answer, a server problem or a reply we couldn't read: the money may have gone. Recorded for Craves.
      pending.current = request;
      answered = false;
      chefErrorText(error instanceof ChefError ? error : new ChefError("", "WITHDRAWAL_OUTCOME_UNCERTAIN", 0), "");
      setOutcome({kind: "uncertain"});
    } finally {
      sending.current = false;
      setBusy(false);
      setConfirming(false);
    }
    if (answered) {
      try {setBalance(await load());} catch {/* The answer above stands; Check balance again reads it later. */}
    }
  }
  function start() {
    if (!balance || sending.current || pending.current) return;
    const request = {requestKey: crypto.randomUUID(), expectedAvailableAmount: balance.available};
    pending.current = request;
    void send(request);
  }

  const lastPayout = balance?.recentPayouts[0];
  const amount = balance ? formatInr(balance.available) : "";
  const uncertain = outcome?.kind === "uncertain";
  // A bank account that isn't verified decides first; nothing until it has been read, so the words don't jump.
  const bankNotice = !bank || bank.state === "VERIFIED" ? null
    : bank.state === "NOT_SUBMITTED" ? <ChefNotice icon={Landmark}><p>{text.noBank}</p><Link href="/chef/bank" className={NOTICE_LINK}>{text.addBank}</Link></ChefNotice>
    : BANK_NEEDS_CHEF.has(bank.state) ? <ChefNotice icon={AlertTriangle} tone="danger"><p>{text.bankAttention}</p><Link href="/chef/bank" className={NOTICE_LINK}>{text.bankAccount}</Link></ChefNotice>
    : <ChefNotice icon={Info}><p>{text.bankChecking}</p></ChefNotice>;
  const hold = bankNotice ?? (balance?.onHold && bank !== undefined
    ? <ChefNotice icon={AlertTriangle} tone="danger"><p><strong>{text.holdTitle}</strong> {text.holdText}</p><Link href="/chef/support" className={NOTICE_LINK}>{text.help}</Link></ChefNotice>
    : null);
  const blocked = !balance || balance.onHold || balance.manualRequestUsedToday || !balance.executionEnabled || !(Number(balance.available) > 0) || bankNotice !== null;
  const bankDetail = bank ? [bank.lastFour ? format(text.accountEnding, {lastFour: bank.lastFour}) : null, bank.accountHolderName].filter(Boolean).join(" · ") : "";
  const account = bankLine(bank);
  const sentTo = account ? format(text.sentTo, {bank: account}) : text.track;
  return <div className="chef-stack">
    <ChefSection title={text.title} labelledBy="chef-balance">
      {!balance ? (
        message ? <ChefNotice icon={AlertTriangle} role="status">{message}</ChefNotice> : <ChefBalanceSkeleton />
      ) : <>
        <p className="font-display text-[2.25rem] font-bold leading-none tracking-[-0.03em] text-[#1A1A1A] chef-amount">{amount}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-[0.875rem]">
          <div><dt className="text-[#6B6B6B]">{text.notPaid}</dt><dd className="chef-amount mt-0.5 font-semibold">{formatInr(balance.outstanding)}</dd></div>
          <div><dt className="text-[#6B6B6B]">{text.reserved}</dt><dd className="chef-amount mt-0.5 font-semibold">{formatInr(balance.reservedOrPaid)}</dd></div>
        </dl>
        {message ? <div className="mt-4"><ChefNotice icon={Info} role="status">{message}</ChefNotice></div> : null}
        {hold ? <div className="mt-4">{hold}</div> : null}
        {!balance.executionEnabled ? <p className="mt-4 text-[0.875rem] text-[#6B6B6B]">{text.paused}</p> : null}
        {balance.manualRequestUsedToday ? <p className="mt-4 text-[0.875rem] text-[#6B6B6B]">{format(text.usedToday, {when: new Date(balance.nextManualRequestAt).toLocaleString(LANGUAGE_NAMES[language].locale, {timeZone: "Asia/Kolkata", weekday: "short", hour: "numeric", minute: "2-digit"}).toLowerCase()})}</p> : null}
        {/* The first tap only opens the confirm step: amount, the account it goes to, then Withdraw. */}
        <button type="button" className="chef-btn is-primary is-block mt-5" aria-haspopup="dialog" disabled={busy || uncertain || blocked} onClick={() => {setOutcome(null); setConfirming(true);}}>{format(text.withdraw, {amount})}</button>
        {/* Always there, so its words are read out when they arrive. */}
        <div aria-live="polite">
          {outcome?.kind === "sent" ? <div className="mt-4"><ChefNotice icon={CheckCircle2}><strong className="block text-[0.9375rem]">{format(text.onItsWay, {amount: formatInr(outcome.amount)})}</strong>{sentTo}</ChefNotice></div> : null}
          {outcome?.kind === "failed" ? <div className="mt-4"><ChefNotice icon={AlertTriangle} tone="danger"><strong className="block text-[0.9375rem]">{text.failedTitle}</strong>{outcome.message}</ChefNotice></div> : null}
          {uncertain ? <div className="mt-4"><ChefNotice icon={AlertTriangle}>
            <strong className="block text-[0.9375rem]">{text.uncertainTitle}</strong>{text.uncertainText}
            <button type="button" className={`${NOTICE_LINK} w-full sm:w-auto`} disabled={busy} aria-busy={busy} onClick={() => {if (pending.current) void send(pending.current);}}><RefreshCw className="h-4 w-4" aria-hidden="true" />{busy ? text.checking : text.checkStatus}</button>
          </ChefNotice></div> : null}
        </div>
        <p className="mt-3 text-[0.8125rem] leading-5 text-[#6B6B6B]">{balance.payoutMode === "CRAVES_MANUAL" ? text.sendsManual : text.sendsChecked} {text.rules}</p>
      </>}
      {compact ? <Link href="/chef/finance" className="mt-4 flex min-h-11 items-center justify-between gap-3 border-t border-[#E3E6EA] pt-3 font-semibold text-[#1A1A1A] no-underline">{text.more}<ChevronRight className="chef-chevron h-5 w-5" aria-hidden="true" /></Link> : null}
    </ChefSection>

    <Sheet
      open={confirming && balance !== null}
      onOpenChange={setConfirming}
      title={text.sheetTitle}
      busy={busy}
      footer={<>
        <button type="button" className={secondaryActionClass} disabled={busy} onClick={() => setConfirming(false)}>{text.cancel}</button>
        <button type="button" className="craves-primary-action w-full sm:w-auto" disabled={busy} aria-busy={busy} onClick={start}>{busy ? text.sending : format(text.withdraw, {amount})}</button>
      </>}
    >
      {/* Sheets open outside the chef page: the theme brings the chef colours along. */}
      <div className="chef-panel-theme chef-sheet-theme mt-5 grid gap-3">
        <div className="rounded-2xl border border-[#E3E6EA] px-4 py-5 text-center">
          <p className="text-[0.875rem] text-[#6B6B6B]">{text.amount}</p>
          <p className="chef-amount mt-1 font-display text-[2rem] font-bold leading-tight text-[#1A1A1A]">{amount}</p>
          <p className="mt-1 text-[0.875rem] text-[#6B6B6B]">{text.fullBalance}</p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-[#E3E6EA] p-4">
          <span className="chef-row-icon"><Landmark className="h-5 w-5" aria-hidden="true" /></span>
          <span className="chef-row-main">
            <span className="chef-row-title block">{bank?.bankName || text.bankAccount}</span>
            <span className="chef-row-meta block">{bankDetail || text.toVerified}</span>
          </span>
          {bank?.state === "VERIFIED" ? <ChefPill tone="success">{text.verified}</ChefPill> : null}
        </div>
        <p className="text-[0.875rem] leading-6 text-[#6B6B6B]">{text.sheetNote}</p>
      </div>
    </Sheet>

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

    {/* The Earnings tab keeps this for when something went wrong; the full page always has it. */}
    {!compact || message ? <div className="flex justify-center"><button type="button" onClick={() => void refresh()} disabled={busy} className="chef-btn is-small"><RefreshCw className="h-4 w-4" aria-hidden="true" />{text.checkAgain}</button></div> : null}
  </div>;
}

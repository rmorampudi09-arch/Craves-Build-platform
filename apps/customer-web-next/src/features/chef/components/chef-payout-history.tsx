"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronRight, Landmark } from "lucide-react";
import {
  ChefEmpty,
  ChefPill,
  ChefSkeleton,
  clockTime,
  formatInr,
} from "@/features/chef/components/chef-ui";
import { chefBalanceSchema, type ChefBalance } from "@/features/admin/finance/lib/finance-contract";
import {
  CHEF_ERROR_MESSAGES,
  chefApiError,
  ChefError,
  chefErrorText,
} from "@/features/chef/lib/chef-errors";
import { istDayName, istDayStart } from "@/features/chef/lib/chef-earnings-insights";
import { groupByMonth, payoutStatusView } from "@/features/chef/lib/chef-payout-presentation";
import { format, messages, type Language } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";
import { sessionFetch } from "@/shared/lib/session-fetch";
import { Sheet } from "@/shared/ui/overlays/overlay";

type Payout = ChefBalance["recentPayouts"][number];

const TEXT = messages({
  en: {
    loadFailed: "We couldn’t load your payouts. Check your connection and try again.",
    unreadable: CHEF_ERROR_MESSAGES.UNEXPECTED_RESPONSE,
    loading: "Loading your payouts",
    failedTitle: "We couldn’t load your payouts.",
    tryAgain: "Try again",
    emptyTitle: "No payouts yet",
    emptyText: "When you withdraw, the money sent to your bank is listed here.",
    goToBalance: "Go to Balance & payouts",
    requested: "Requested {when}",
    bankRef: "Bank ref {ref}",
    details: "Payout details",
    amount: "Amount",
    status: "Status",
    requestedAt: "Requested",
    bankReference: "Bank reference",
  },
  te: {
    loadFailed: "మీ చెల్లింపులు లోడ్ కాలేదు. ఇంటర్నెట్ చూసుకుని మళ్లీ ప్రయత్నించండి.",
    unreadable: "Craves నుండి వచ్చిన జవాబును ఈ స్క్రీన్ చదవలేకపోయింది. పేజీని మళ్లీ లోడ్ చేయండి; ఇలాగే జరుగుతుంటే Craves సపోర్ట్‌ను సంప్రదించండి.",
    loading: "మీ చెల్లింపులు లోడ్ అవుతున్నాయి",
    failedTitle: "మీ చెల్లింపులు లోడ్ కాలేదు.",
    tryAgain: "మళ్లీ ప్రయత్నించండి",
    emptyTitle: "ఇంకా చెల్లింపులు లేవు",
    emptyText: "మీరు డబ్బు తీసుకున్నప్పుడు, మీ బ్యాంక్‌కు పంపిన డబ్బు ఇక్కడ కనిపిస్తుంది.",
    goToBalance: "మీ డబ్బు, చెల్లింపులు చూడండి",
    requested: "{when} అడిగారు",
    bankRef: "బ్యాంక్ రిఫరెన్స్ {ref}",
    details: "చెల్లింపు వివరాలు",
    amount: "మొత్తం",
    status: "స్థితి",
    requestedAt: "అడిగిన సమయం",
    bankReference: "బ్యాంక్ రిఫరెన్స్",
  },
  kn: {
    loadFailed: "ನಿಮ್ಮ ಪಾವತಿಗಳು ಲೋಡ್ ಆಗಲಿಲ್ಲ. ಇಂಟರ್ನೆಟ್ ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    unreadable: "Craves ನಿಂದ ಬಂದ ಉತ್ತರವನ್ನು ಈ ಸ್ಕ್ರೀನ್ ಓದಲು ಆಗಲಿಲ್ಲ. ಪುಟವನ್ನು ಮತ್ತೆ ಲೋಡ್ ಮಾಡಿ; ಹೀಗೇ ಆಗುತ್ತಿದ್ದರೆ Craves ಸಪೋರ್ಟ್ ಅನ್ನು ಸಂಪರ್ಕಿಸಿ.",
    loading: "ನಿಮ್ಮ ಪಾವತಿಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ",
    failedTitle: "ನಿಮ್ಮ ಪಾವತಿಗಳು ಲೋಡ್ ಆಗಲಿಲ್ಲ.",
    tryAgain: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ",
    emptyTitle: "ಇನ್ನೂ ಪಾವತಿಗಳಿಲ್ಲ",
    emptyText: "ನೀವು ಹಣ ತೆಗೆದುಕೊಂಡಾಗ, ನಿಮ್ಮ ಬ್ಯಾಂಕ್‌ಗೆ ಕಳುಹಿಸಿದ ಹಣ ಇಲ್ಲಿ ಕಾಣುತ್ತದೆ.",
    goToBalance: "ನಿಮ್ಮ ಹಣ, ಪಾವತಿಗಳು ನೋಡಿ",
    requested: "{when} ಕೇಳಿದ್ದೀರಿ",
    bankRef: "ಬ್ಯಾಂಕ್ ರೆಫರೆನ್ಸ್ {ref}",
    details: "ಪಾವತಿ ವಿವರಗಳು",
    amount: "ಮೊತ್ತ",
    status: "ಸ್ಥಿತಿ",
    requestedAt: "ಕೇಳಿದ ಸಮಯ",
    bankReference: "ಬ್ಯಾಂಕ್ ರೆಫರೆನ್ಸ್",
  },
});

/** "today, 1:31 pm" or "Mon, 12 Oct, 1:31 pm" in India time. */
function requested(iso: string, now: number, language: Language): string {
  const day = istDayName(istDayStart(Date.parse(iso)), now, language);
  // English reads "today, 1:31 pm"; a weekday keeps its capital, and Telugu and Kannada have no case.
  return `${/^(Today|Yesterday)$/.test(day) ? day.toLowerCase() : day}, ${clockTime(iso)}`;
}

/** Money sent to the bank, newest first by month; a payout opens its details. */
export function ChefPayoutHistory() {
  const text = useText(TEXT);
  const { language } = useLanguage();
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "ready"; payouts: Payout[] } | { kind: "failed"; message: string }
  >({ kind: "loading" });
  const [opened, setOpened] = useState<Payout | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const response = await sessionFetch("/api/chef/finance/balance", { cache: "no-store" });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw chefApiError(response, body, text.loadFailed);
      const balance = chefBalanceSchema.safeParse(body);
      if (!balance.success)
        throw new ChefError(
          text.unreadable,
          "INVALID_CHEF_BALANCE_RESPONSE",
          response.status,
        );
      setNow(Date.now());
      setState({
        kind: "ready",
        payouts: [...balance.data.recentPayouts].sort(
          (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
        ),
      });
    } catch (error) {
      setState({ kind: "failed", message: chefErrorText(error, text.loadFailed) });
    }
  }, [text]);
  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === "loading")
    return (
      <div className="chef-stack" role="status" aria-label={text.loading}>
        <ChefSkeleton className="h-5 w-24 !rounded-md" />
        <ChefSkeleton className="h-48 w-full" />
      </div>
    );
  if (state.kind === "failed")
    return (
      <section className="chef-section">
        <ChefEmpty
          icon={AlertTriangle}
          title={text.failedTitle}
          text={state.message}
          action={
            <button type="button" className="chef-btn" onClick={() => void load()}>
              {text.tryAgain}
            </button>
          }
        />
      </section>
    );
  if (state.payouts.length === 0)
    return (
      <section className="chef-section">
        <ChefEmpty
          icon={Landmark}
          title={text.emptyTitle}
          text={text.emptyText}
          action={
            <Link href="/chef/finance" className="chef-btn">
              {text.goToBalance}
            </Link>
          }
        />
      </section>
    );

  const view = opened ? payoutStatusView(opened.status, language) : null;
  return (
    <div className="chef-stack">
      {groupByMonth(state.payouts, (payout) => payout.createdAt, now, language).map((group) => (
        <section key={group.title} aria-label={group.title} className="grid gap-2">
          <h2 className="chef-group-title">{group.title}</h2>
          <ul className="chef-section chef-list">
            {group.items.map((payout) => {
              const status = payoutStatusView(payout.status, language);
              return (
                <li key={payout.id}>
                  <button
                    type="button"
                    className="chef-row w-full !border-0 !bg-transparent text-left"
                    onClick={() => setOpened(payout)}
                  >
                    <span className="chef-row-main">
                      <span className="chef-row-title chef-amount block">
                        {formatInr(payout.amount)}
                      </span>
                      <span className="chef-row-meta block">
                        {format(text.requested, { when: requested(payout.createdAt, now, language) })}
                      </span>
                      {payout.transferReference ? (
                        <span className="chef-row-meta block break-all">
                          {format(text.bankRef, { ref: payout.transferReference })}
                        </span>
                      ) : null}
                    </span>
                    <ChefPill tone={status.tone}>{status.label}</ChefPill>
                    <ChevronRight className="chef-chevron h-5 w-5" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <Sheet
        open={opened !== null}
        onOpenChange={(open) => {
          if (!open) setOpened(null);
        }}
        title={text.details}
      >
        {opened && view ? (
          // Sheets open outside the chef page: the theme brings the chef colours along. It sits on a wrapper
          // because its padding-bottom: 0 (unlayered) would beat the list's p-4.
          <div className="chef-panel-theme chef-sheet-theme">
            <dl className="mt-4 grid gap-3 rounded-xl border border-[#E3E6EA] p-4 text-[0.9375rem]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[#6B6B6B]">{text.amount}</dt>
                <dd className="chef-amount font-semibold">{formatInr(opened.amount)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[#6B6B6B]">{text.status}</dt>
                <dd>
                  <ChefPill tone={view.tone}>{view.label}</ChefPill>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[#6B6B6B]">{text.requestedAt}</dt>
                <dd className="text-right font-semibold">{requested(opened.createdAt, now, language)}</dd>
              </div>
              {opened.transferReference ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[#6B6B6B]">{text.bankReference}</dt>
                  <dd className="break-all text-right font-semibold">{opened.transferReference}</dd>
                </div>
              ) : null}
            </dl>
            <p className="mt-3 text-[0.875rem] leading-6 text-[#6B6B6B]">{view.note}</p>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}

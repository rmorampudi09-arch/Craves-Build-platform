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
import { sessionFetch } from "@/shared/lib/session-fetch";
import { Sheet } from "@/shared/ui/overlays/overlay";

type Payout = ChefBalance["recentPayouts"][number];
const LOAD_FAILED = "We couldn’t load your payouts. Check your connection and try again.";

/** "today, 1:31 pm" or "Mon, 12 Oct, 1:31 pm" in India time. */
function requested(iso: string, now: number): string {
  const day = istDayName(istDayStart(Date.parse(iso)), now);
  return `${day === "Today" || day === "Yesterday" ? day.toLowerCase() : day}, ${clockTime(iso)}`;
}

/** Money sent to the bank, newest first by month; a payout opens its details. */
export function ChefPayoutHistory() {
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
      if (!response.ok) throw chefApiError(response, body, LOAD_FAILED);
      const balance = chefBalanceSchema.safeParse(body);
      if (!balance.success)
        throw new ChefError(
          CHEF_ERROR_MESSAGES.UNEXPECTED_RESPONSE,
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
      setState({ kind: "failed", message: chefErrorText(error, LOAD_FAILED) });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === "loading")
    return (
      <div className="chef-stack" role="status" aria-label="Loading your payouts">
        <ChefSkeleton className="h-5 w-24 !rounded-md" />
        <ChefSkeleton className="h-48 w-full" />
      </div>
    );
  if (state.kind === "failed")
    return (
      <section className="chef-section">
        <ChefEmpty
          icon={AlertTriangle}
          title="We couldn’t load your payouts."
          text={state.message}
          action={
            <button type="button" className="chef-btn" onClick={() => void load()}>
              Try again
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
          title="No payouts yet"
          text="When you withdraw, the money sent to your bank is listed here."
          action={
            <Link href="/chef/finance" className="chef-btn">
              Go to Balance &amp; payouts
            </Link>
          }
        />
      </section>
    );

  const view = opened ? payoutStatusView(opened.status) : null;
  return (
    <div className="chef-stack">
      {groupByMonth(state.payouts, (payout) => payout.createdAt, now).map((group) => (
        <section key={group.title} aria-label={group.title} className="grid gap-2">
          <h2 className="chef-group-title">{group.title}</h2>
          <ul className="chef-section chef-list">
            {group.items.map((payout) => {
              const status = payoutStatusView(payout.status);
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
                        Requested {requested(payout.createdAt, now)}
                      </span>
                      {payout.transferReference ? (
                        <span className="chef-row-meta block break-all">
                          Bank ref {payout.transferReference}
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
        title="Payout details"
      >
        {opened && view ? (
          <>
            <dl className="mt-4 grid gap-3 rounded-xl border border-[#E3E6EA] p-4 text-[0.9375rem]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[#6B6B6B]">Amount</dt>
                <dd className="chef-amount font-semibold">{formatInr(opened.amount)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[#6B6B6B]">Status</dt>
                <dd>
                  <ChefPill tone={view.tone}>{view.label}</ChefPill>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[#6B6B6B]">Requested</dt>
                <dd className="text-right font-semibold">{requested(opened.createdAt, now)}</dd>
              </div>
              {opened.transferReference ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[#6B6B6B]">Bank reference</dt>
                  <dd className="break-all text-right font-semibold">{opened.transferReference}</dd>
                </div>
              ) : null}
            </dl>
            <p className="mt-3 text-[0.875rem] leading-6 text-[#6B6B6B]">{view.note}</p>
          </>
        ) : null}
      </Sheet>
    </div>
  );
}

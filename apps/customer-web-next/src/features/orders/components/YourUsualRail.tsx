"use client";

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { History, Loader2, RotateCcw } from "lucide-react";
import {
  listRepeatOrders,
  orderLikeLastTime,
  type ReorderRecovery,
} from "@/features/orders/api/repeat-orders";
import {
  familiarityLabel,
  previousOrderTotalLabel,
  rankRepeatOrderCandidates,
  repeatOrderBasketSummary,
  type RepeatOrderCandidate,
} from "@/features/orders/lib/repeat-order-contract";
import { listFavoriteKitchens } from "@/shared/lib/favorite-entities-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/shared/ui/overlays/alert-dialog";
import { useOverlayHistory } from "@/shared/ui/overlays/overlay";

const VISIBLE_CANDIDATES = 6;
const orderedDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(value));

type Baskets = {
  items: RepeatOrderCandidate[];
  nextCursor: string | null;
  favorites: ReadonlySet<string>;
};

/** "Your usual": the customer's regular baskets, each one tap from a refilled cart (the app's Order like last time). */
export function YourUsualRail() {
  const navigate = useNavigate();
  const [baskets, setBaskets] = useState<Baskets | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [confirming, setConfirming] = useState<((replace: boolean) => void) | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    kitchenId: string;
    message: string;
    recovery: ReorderRecovery;
  } | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    setBaskets(null);
    try {
      const [page, favorites] = await Promise.all([
        listRepeatOrders(),
        // Without favourites the baskets still rank by how often and how recently they were ordered.
        listFavoriteKitchens().then(
          ({ items }) => new Set(items.map((item) => item.kitchenId.toLowerCase())),
          () => new Set<string>(),
        ),
      ]);
      setBaskets({ items: page.items, nextCursor: page.nextCursor, favorites });
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The app ranks every page loaded so far and keeps the best six.
  async function loadMore() {
    if (!baskets?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listRepeatOrders(baskets.nextCursor);
      setBaskets(
        (current) =>
          current && {
            ...current,
            items: [...current.items, ...page.items],
            nextCursor: page.nextCursor,
          },
      );
    } catch {
      setFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const settleConfirm = (replace: boolean) => {
    confirming?.(replace);
    setConfirming(null);
  };
  useOverlayHistory(confirming !== null, () => settleConfirm(false));

  async function reorder(candidate: RepeatOrderCandidate) {
    if (pending) return;
    setPending(candidate.orderId);
    setNotice(null);
    try {
      const outcome = await orderLikeLastTime(
        candidate,
        () => new Promise<boolean>((resolve) => setConfirming(() => resolve)),
      );
      if (!outcome) return;
      if (outcome.added) navigate({ to: "/cart" });
      else
        setNotice({
          kitchenId: candidate.kitchenId,
          message: outcome.message,
          recovery: outcome.recovery,
        });
    } finally {
      setPending(null);
    }
  }

  if (failed) {
    return (
      <div className="mb-7 rounded-2xl bg-[#F1F3F5] p-4" role="alert">
        <p className="text-sm font-semibold text-[#C4200F]">
          Your usual meals could not be refreshed
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-2 min-h-11 rounded-full !border-0 !bg-white px-4 text-sm font-bold !text-[#C4200F] !shadow-none"
        >
          Try again
        </button>
      </div>
    );
  }
  if (!baskets) {
    return (
      <p
        role="status"
        className="mb-7 flex min-h-[4.5rem] items-center gap-3 rounded-2xl bg-[#F1F3F5] p-4 text-sm text-[#6B6B6B]"
      >
        <Loader2
          className="h-5 w-5 shrink-0 text-[#F62E18] motion-safe:animate-spin"
          aria-hidden="true"
        />
        Checking your familiar meals…
      </p>
    );
  }
  if (!baskets.items.length) return null;
  const candidates = rankRepeatOrderCandidates(baskets.items, baskets.favorites).slice(
    0,
    VISIBLE_CANDIDATES,
  );

  return (
    <section aria-labelledby="your-usual-title" className="mb-7">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F1F3F5] text-[#C4200F]">
          <History className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="your-usual-title" className="text-base font-semibold text-[#1A1A1A]">
            Your usual
          </h2>
          <p className="text-[13px] text-[#6B6B6B]">
            Order like last time, then review today&apos;s cart before checkout.
          </p>
        </div>
      </div>

      <div role="status">
        {notice ? (
          <div className="mb-3 rounded-2xl bg-[#F1F3F5] p-4">
            <p className="text-sm font-bold text-[#1A1A1A]">
              That previous basket cannot be rebuilt exactly right now
            </p>
            <p className="mt-1 text-[13px] text-[#6B6B6B]">{notice.message}</p>
            {notice.recovery ? (
              <Link
                to={notice.recovery === "cart" ? "/cart" : `/kitchen/${notice.kitchenId}`}
                className="mt-3 inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-bold text-[#C4200F]"
              >
                {notice.recovery === "cart"
                  ? "Check cart before retrying"
                  : "View today's menu from this kitchen"}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      <ul
        aria-label="Order like last time suggestions"
        className="-mx-4 flex snap-x gap-3 overflow-x-auto overscroll-x-contain px-4 pb-2 md:mx-0 md:px-0"
      >
        {candidates.map((candidate) => {
          const busy = pending === candidate.orderId;
          return (
            <li
              key={candidate.orderId}
              className="flex w-[17.875rem] shrink-0 snap-start flex-col gap-1.5 rounded-2xl border border-[#D8DADD] bg-white p-4 shadow-[0_3px_10px_rgba(0,0,0,0.07)]"
            >
              <div className="flex items-start gap-2">
                <h3 className="line-clamp-2 min-w-0 flex-1 text-[15px] font-semibold text-[#1A1A1A]">
                  {candidate.kitchenName}
                </h3>
                <time
                  dateTime={candidate.lastOrderedAt}
                  className="shrink-0 text-xs text-[#6B6B6B]"
                >
                  {orderedDate(candidate.lastOrderedAt)}
                </time>
              </div>
              {baskets.favorites.has(candidate.kitchenId) ? (
                <p className="self-start rounded-full bg-[#E8F7F1] px-2.5 py-0.5 text-xs font-bold text-[#166B49]">
                  Favorite kitchen
                </p>
              ) : null}
              <p className="line-clamp-2 text-[13px] font-semibold text-[#1A1A1A]">
                {repeatOrderBasketSummary(candidate)}
              </p>
              <p className="text-xs text-[#6B6B6B]">{familiarityLabel(candidate)}</p>
              <p className="text-xs font-semibold text-[#6B6B6B]">
                {previousOrderTotalLabel(candidate)}
              </p>
              <p className="line-clamp-2 text-xs text-[#6B6B6B]">
                {candidate.currentValidationNotice}
              </p>
              {candidate.preferenceRecallSupported ? null : (
                <p className="text-xs text-[#6B6B6B]">
                  Previous customizations are not silently assumed.
                </p>
              )}
              <button
                type="button"
                disabled={pending !== null}
                aria-busy={busy}
                onClick={() => void reorder(candidate)}
                className="craves-primary-action mt-auto !min-h-11 w-full !px-4 !text-sm"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                ) : (
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                )}
                {busy ? "Checking today's menu…" : "Order like last time"}
              </button>
            </li>
          );
        })}
      </ul>

      {baskets.nextCursor ? (
        <button
          type="button"
          disabled={loadingMore}
          aria-busy={loadingMore}
          onClick={() => void loadMore()}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl !border !border-[#D8DADD] !bg-white text-sm font-bold !text-[#C4200F] !shadow-none"
        >
          {loadingMore ? (
            <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
          ) : null}
          Show more familiar orders
        </button>
      ) : null}

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) settleConfirm(false);
        }}
      >
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-md rounded-[1.8rem] border-[#E5E7EB] bg-white p-6 text-[#1A1A1A] sm:rounded-[1.8rem]">
          <AlertDialogTitle className="text-xl font-bold">Replace current cart?</AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-6 text-[#6B6B6B]">
            Craves will recheck this exact cart before replacing it. The previous basket will then
            be rebuilt using today’s availability and prices.
          </AlertDialogDescription>
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <AlertDialogCancel className="!mt-0 !min-h-11 !rounded-full !border-0 !bg-[#F1F3F5] !px-5 !text-sm !font-bold !text-[#1A1A1A]">
              Keep cart
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => settleConfirm(true)}
              className="!min-h-11 !rounded-full !bg-[#C4200F] !px-5 !text-sm !font-bold !text-white"
            >
              Verify &amp; replace
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

import { Link } from "@tanstack/react-router";
import { AlertTriangle, BellPlus, BellRing, ChefHat, Heart, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { resolveFavoriteHomes, SavedResolveError } from "@/features/favorites/api/savedResolve";
import {
  favoriteHomeName,
  favoriteHomeState,
  isWatched,
  mergeSavedHomes,
  watchChanges,
  type SavedHomeEntry,
  type WatchKey,
} from "@/features/favorites/lib/saved-presentation";
import { CustomerSectionSkeleton } from "@/shared/components/loading/CustomerPageSkeleton";
import { setKitchenSaved } from "@/shared/hooks/use-favorite-kitchen";
import { useKitchenProfile } from "@/shared/hooks/use-kitchen-profile";
import {
  FavoriteEntityError,
  listFavoriteChefs,
  listFavoriteKitchens,
  listFavoriteWatches,
  setFavoriteChef,
  setFavoriteKitchen,
  setFavoriteWatch,
} from "@/shared/lib/favorite-entities-client";
import type { FavoriteWatch } from "@/shared/lib/favorite-entities-contract";
import { FEATURE_NOT_AVAILABLE } from "@/shared/lib/feature-availability";
import { ChefFace } from "@/shared/ui/data-display/ChefFace";
import { ComingSoon } from "@/shared/ui/feedback/ComingSoon";

// "more": the list stays up while the next pages load.
type Status = "loading" | "unavailable" | "list-error" | "resolve-error" | "ready" | "more";
type SavedIds = {
  kitchenIds: string[];
  chefIds: string[];
  kitchenCursor: string | null;
  chefCursor: string | null;
};

const watchKey = (watch: Pick<FavoriteWatch, "entityType" | "entityId">): WatchKey =>
  `${watch.entityType}:${watch.entityId}`;

function onWatches(watches: FavoriteWatch[]): Set<WatchKey> {
  return new Set(
    watches.filter((watch) => watch.channel === "IN_APP" && watch.enabled).map(watchKey),
  );
}

function Notice({
  title,
  detail,
  action,
  onAction,
}: {
  title: string;
  detail: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white px-6 py-10 text-center shadow-sm">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F3F5] text-[#C4200F]">
        <AlertTriangle className="h-5 w-5" aria-hidden="true" />
      </span>
      <h2 className="mt-4 font-display text-lg font-black">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6B6B6B]">{detail}</p>
      <button type="button" onClick={onAction} className="craves-primary-action mt-5">
        {action}
      </button>
    </div>
  );
}

function SavedHomeRow({
  entry,
  watched,
  busy,
  onToggleWatch,
  onRemove,
}: {
  entry: SavedHomeEntry;
  watched: Set<WatchKey> | null;
  busy: boolean;
  onToggleWatch: () => void;
  onRemove: () => void;
}) {
  const { card } = entry;
  const kitchenId = card.exists ? card.kitchenId : null;
  const { profile } = useKitchenProfile(kitchenId);
  const name = favoriteHomeName(card);
  const area = [card.areaName, card.city].filter(Boolean).join(", ");
  const state = favoriteHomeState(card);
  const alerts = watched !== null && isWatched(entry, watched);
  const body: ReactNode = (
    <>
      <ChefFace photoUrl={profile?.chefPhotoUrl} name={name} size={56} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-base font-black">{name}</span>
        {area ? (
          <span className="block truncate text-xs font-semibold text-[#6B6B6B]">{area}</span>
        ) : null}
        <span
          className={`mt-1 flex items-center gap-1.5 text-xs font-bold ${state.tone === "positive" ? "text-[#2E7D32]" : "text-[#6B6B6B]"}`}
        >
          {state.tone === "positive" ? (
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#2E7D32]" />
          ) : null}
          {state.title}
        </span>
      </span>
    </>
  );
  return (
    <li className="flex items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-[0_4px_16px_rgba(26,26,26,0.04)]">
      {kitchenId ? (
        <Link
          to="/kitchen/$id"
          params={{ id: kitchenId }}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl transition-colors hover:text-[#F62E18]"
        >
          {body}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
      )}
      {watched !== null ? (
        <button
          type="button"
          onClick={onToggleWatch}
          disabled={busy}
          aria-pressed={alerts}
          aria-label={`Cooking alerts from ${name}`}
          title={alerts ? "Cooking alerts on" : "Get cooking alerts"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18] transition-colors hover:text-[#C4200F] disabled:cursor-wait disabled:opacity-50"
        >
          {alerts ? (
            <BellRing className="h-5 w-5 fill-current" aria-hidden="true" />
          ) : (
            <BellPlus className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        disabled={busy}
        aria-label={`Remove ${name} from saved`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-transparent text-[#F62E18] transition-colors hover:text-[#C4200F] disabled:cursor-wait disabled:opacity-50"
      >
        <Heart className="h-5 w-5 fill-current" aria-hidden="true" />
      </button>
    </li>
  );
}

/** Saved → Home chefs: saved kitchens and chefs, who is cooking today, and an in-app alert bell for each. */
export function SavedHomes() {
  const [status, setStatus] = useState<Status>("loading");
  const [entries, setEntries] = useState<SavedHomeEntry[]>([]);
  // null when alerts can't be read: the bells are hidden rather than shown wrong.
  const [watched, setWatched] = useState<Set<WatchKey> | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState<SavedIds | null>(null);

  // A fresh load reads both first pages; "Load more" reads the next page of each list that has one.
  const load = useCallback(async (more: SavedIds | null = null) => {
    setStatus(more ? "more" : "loading");
    setNotice("");
    let next: SavedIds;
    try {
      const [kitchens, chefs] = await Promise.all([
        !more || more.kitchenCursor ? listFavoriteKitchens(more?.kitchenCursor) : null,
        !more || more.chefCursor ? listFavoriteChefs(more?.chefCursor) : null,
      ]);
      next = {
        kitchenIds: [
          ...(more?.kitchenIds ?? []),
          ...(kitchens?.items.map((item) => item.kitchenId) ?? []),
        ],
        chefIds: [
          ...(more?.chefIds ?? []),
          ...(chefs?.items.map((item) => item.chefIdentityId) ?? []),
        ],
        kitchenCursor: kitchens?.nextCursor ?? null,
        chefCursor: chefs?.nextCursor ?? null,
      };
    } catch (error) {
      setStatus(
        error instanceof FavoriteEntityError && error.code === FEATURE_NOT_AVAILABLE
          ? "unavailable"
          : "list-error",
      );
      return;
    }
    const { kitchenIds, chefIds } = next;
    if (kitchenIds.length + chefIds.length === 0) {
      setSaved(next);
      setEntries([]);
      setStatus("ready");
      return;
    }
    try {
      // Like the app, every saved home loaded so far is checked again, so rows merge across pages.
      const [cards, watches] = await Promise.all([
        resolveFavoriteHomes(chefIds, kitchenIds),
        Promise.all([listFavoriteWatches("KITCHEN"), listFavoriteWatches("CHEF")]).then(
          (pages) => onWatches(pages.flat()),
          () => null,
        ),
      ]);
      setWatched(watches);
      setSaved(next);
      setEntries(
        mergeSavedHomes(
          cards.filter((card) => card.requestedType === "KITCHEN"),
          cards.filter((card) => card.requestedType === "CHEF"),
        ),
      );
      setStatus("ready");
    } catch (error) {
      setStatus(
        error instanceof SavedResolveError && error.code === FEATURE_NOT_AVAILABLE
          ? "unavailable"
          : "resolve-error",
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(entry: SavedHomeEntry) {
    const name = favoriteHomeName(entry.card);
    setBusy(true);
    setNotice("");
    try {
      // Clear every saved relation behind this row, or it would come back from the other list.
      await Promise.all([
        entry.chefIdentityId ? setFavoriteChef(entry.chefIdentityId, false) : null,
        entry.kitchenId ? setFavoriteKitchen(entry.kitchenId, false) : null,
      ]);
      if (entry.kitchenId) setKitchenSaved(entry.kitchenId, false);
      setEntries((current) => current.filter((item) => item !== entry));
      // So the next "Load more" doesn't bring it back.
      setSaved(
        (current) =>
          current && {
            ...current,
            kitchenIds: current.kitchenIds.filter((id) => id !== entry.kitchenId),
            chefIds: current.chefIds.filter((id) => id !== entry.chefIdentityId),
          },
      );
      setNotice(`${name} was removed from Saved.`);
    } catch {
      setNotice(`We couldn’t remove ${name}. Please try again.`);
    } finally {
      setBusy(false);
    }
  }

  async function toggleWatch(entry: SavedHomeEntry) {
    if (!watched) return;
    const name = favoriteHomeName(entry.card);
    const changes = watchChanges(entry, watched);
    setBusy(true);
    setNotice("");
    try {
      for (const change of changes) {
        const saved = await setFavoriteWatch(change.entityType, change.entityId, change.enabled);
        setWatched((current) => {
          const next = new Set(current);
          if (saved.channel === "IN_APP" && saved.enabled) next.add(watchKey(saved));
          else next.delete(watchKey(saved));
          return next;
        });
      }
      setNotice(
        changes[0]?.enabled
          ? `We’ll tell you in Craves when ${name} is cooking.`
          : `Cooking alerts from ${name} are off.`,
      );
    } catch {
      setNotice(`We couldn’t change cooking alerts for ${name}. Please try again.`);
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading")
    return <CustomerSectionSkeleton variant="saved" label="Loading saved home chefs" />;
  if (status === "unavailable") {
    return (
      <ComingSoon
        title="Saved home chefs"
        message="Saving kitchens and home chefs is coming to the website soon."
      />
    );
  }
  if (status === "list-error") {
    return (
      <Notice
        title="Saved home chefs could not be loaded"
        detail="Check your connection and try again."
        action="Try again"
        onAction={() => void load()}
      />
    );
  }
  if (status === "resolve-error") {
    return (
      <Notice
        title="Your saved home chefs are safe"
        detail="We could not check who is cooking today. Nothing was removed."
        action="Check again"
        onAction={() => void load()}
      />
    );
  }
  const hasMore = Boolean(saved?.kitchenCursor || saved?.chefCursor);
  if (entries.length === 0 && !hasMore) {
    return (
      <div className="px-4 py-12 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
          <ChefHat className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="mt-4 font-display text-xl font-black">No saved home chefs yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6B6B6B]">
          Tap the heart on any kitchen to save its home chef here.
        </p>
        {notice ? (
          <p role="status" className="mt-3 text-sm font-semibold">
            {notice}
          </p>
        ) : null}
        <Link to="/home" className="craves-primary-action mt-5">
          Browse meals
        </Link>
      </div>
    );
  }
  return (
    <>
      <p
        role="status"
        className={
          notice ? "mb-3 rounded-xl bg-[#F1F3F5] px-4 py-2.5 text-sm font-semibold" : "sr-only"
        }
      >
        {notice}
      </p>
      <ul className="space-y-3">
        {entries.map((entry) => (
          <SavedHomeRow
            key={`${entry.card.requestedType}:${entry.card.requestedId}`}
            entry={entry}
            watched={watched}
            busy={busy || status === "more"}
            onToggleWatch={() => void toggleWatch(entry)}
            onRemove={() => void remove(entry)}
          />
        ))}
      </ul>
      {hasMore ? (
        <button
          type="button"
          disabled={busy || status === "more"}
          aria-busy={status === "more"}
          onClick={() => void load(saved)}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl !border !border-[#D8DADD] !bg-white text-sm font-bold !text-[#C4200F] !shadow-none"
        >
          {status === "more" ? (
            <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
          ) : null}
          Load more saved home chefs
        </button>
      ) : null}
      <p className="mt-3 px-1 text-sm text-[#6B6B6B]">
        Tap the heart on any kitchen to save its home chef here.
      </p>
    </>
  );
}

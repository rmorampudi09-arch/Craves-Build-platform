import { Link } from "@tanstack/react-router";
import { Bell, BellPlus, Check, Heart, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

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
import { EmptyState } from "@/shared/ui/feedback/EmptyState";

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

/** The bell and the heart: 48 px soft red circles, as in the app (1.35). */
const ROUND_ACTION =
  "relative z-10 flex h-12 min-h-12 w-12 min-w-12 shrink-0 items-center justify-center rounded-full !border-0 !bg-[#FDEAE8] !p-0 !text-[#F62E18] !shadow-none transition-[background-color,scale] duration-(--dur-micro) hover:!bg-[#FBD5D0] active:scale-[0.94] disabled:cursor-wait disabled:opacity-50 motion-reduce:transform-none";

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
  const cooking = state.tone === "positive";
  const alerts = watched !== null && isWatched(entry, watched);
  const nameClass = "block truncate font-display text-xl font-bold leading-7 text-[#261A15]";
  return (
    // The whole card opens the kitchen (the name's link stretches over it); the bell and heart sit above it as their own buttons.
    <li className="relative flex items-center gap-3 rounded-[20px] border border-[#E3DDD8] bg-white px-4 py-3.5 transition-colors duration-150 hover:border-[#D5CEC8]">
      {/* No initials here: like the app, a chef without a picture shows the chef hat. */}
      <ChefFace
        photoUrl={profile?.chefPhotoUrl}
        size={56}
        className="bg-[#FDEAE8] text-[#D92714]"
      />
      <div className="min-w-0 flex-1">
        {kitchenId ? (
          <Link
            to="/kitchen/$id"
            params={{ id: kitchenId }}
            className={`${nameClass} rounded-sm after:absolute after:inset-0 after:rounded-[20px] focus-visible:!outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[#1A1A1A] focus-visible:after:outline-solid`}
          >
            {name}
          </Link>
        ) : (
          <p className={nameClass}>{name}</p>
        )}
        {area ? (
          <p className="truncate text-[0.9375rem] leading-5 text-[#706864]">{area}</p>
        ) : null}
        <p
          className={`mt-0.5 flex items-center gap-1.5 text-[0.9375rem] font-bold leading-5 ${cooking ? "text-[#166B49]" : "text-[#706864]"}`}
        >
          {cooking ? (
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-[#29B47B]" />
          ) : null}
          {state.title}
        </p>
      </div>
      {watched !== null ? (
        <button
          type="button"
          onClick={onToggleWatch}
          disabled={busy}
          aria-label={
            alerts
              ? `Stop cooking alerts from ${name}`
              : `Alert me in the app when ${name} is cooking`
          }
          title={alerts ? "Cooking alerts on" : "Get cooking alerts"}
          className={ROUND_ACTION}
        >
          {alerts ? (
            <span aria-hidden="true" className="relative h-[22px] w-[22px]">
              <Bell className="absolute inset-0 h-full w-full fill-current" />
              <Check
                strokeWidth={4}
                className="absolute left-1/2 top-[44%] h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 text-white"
              />
            </span>
          ) : (
            <BellPlus className="h-[22px] w-[22px]" aria-hidden="true" />
          )}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        disabled={busy}
        aria-label={`Remove ${name} from saved`}
        className={ROUND_ACTION}
      >
        <Heart className="h-[22px] w-[22px] fill-current" aria-hidden="true" />
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
      <EmptyState
        role="alert"
        illustration="loadError"
        title="Saved home chefs could not be loaded"
        message="Check your connection and try again."
      >
        <button type="button" onClick={() => void load()} className="craves-primary-action">
          Try again
        </button>
      </EmptyState>
    );
  }
  if (status === "resolve-error") {
    return (
      <EmptyState
        illustration="saved"
        title="Your saved home chefs are safe"
        message="We could not check who is cooking today. Nothing was removed."
      >
        <button type="button" onClick={() => void load()} className="craves-primary-action">
          Check again
        </button>
      </EmptyState>
    );
  }
  const hasMore = Boolean(saved?.kitchenCursor || saved?.chefCursor);
  if (entries.length === 0 && !hasMore) {
    return (
      <EmptyState
        illustration="saved"
        title="No saved home chefs yet"
        message={
          <>
            Tap the heart on any kitchen to keep its home chef here.
            {notice ? (
              <span role="status" className="mt-2 block font-semibold text-[#1A1A1A]">
                {notice}
              </span>
            ) : null}
          </>
        }
      >
        <Link to="/chefs" className="craves-primary-action">
          Explore home chefs
        </Link>
      </EmptyState>
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
      {/* One column on phones (as in the app), two side by side from tablet width. */}
      <ul className="grid gap-3 md:grid-cols-2">
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
          className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] !border !bg-white text-[0.9375rem] font-bold !text-[#D92714] !shadow-none hover:!bg-[#FDEAE8] md:mx-auto md:w-auto md:px-6"
        >
          {status === "more" ? (
            <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
          ) : null}
          Load more saved home chefs
        </button>
      ) : null}
      <p className="mt-3 px-1 text-[0.9375rem] text-[#706864]">
        Tap the heart on any kitchen to save its home chef here.
      </p>
    </>
  );
}

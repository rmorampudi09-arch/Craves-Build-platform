import {
  AlertTriangle,
  ArrowRight,
  ChefHat,
  MapPin,
  RefreshCw,
  SearchX,
  Utensils,
} from "lucide-react";

import {
  formatDistance,
  type NearbyKitchen,
} from "@/lib/discovery-contract";

type DiscoveryState = "loading" | "ready" | "error" | "address-required";

interface KitchensGridProps {
  kitchens: NearbyKitchen[];
  searchTerm: string;
  state: DiscoveryState;
  message: string;
  onSelectKitchen: (kitchen: NearbyKitchen) => void;
  onRetry: () => void;
  onManageAddress: () => void;
}

function KitchenSkeleton() {
  return (
    <div className="rounded-2xl border border-[#ECEDEF] bg-white p-5" aria-hidden="true">
      <div className="h-16 w-16 animate-pulse rounded-2xl bg-[#F1F3F5]" />
      <div className="mt-5 h-6 w-2/3 animate-pulse rounded bg-[#F1F3F5]" />
      <div className="mt-3 h-4 w-1/2 animate-pulse rounded bg-[#F1F3F5]" />
      <div className="mt-5 h-11 w-full animate-pulse rounded-xl bg-[#F1F3F5]" />
    </div>
  );
}

export function KitchensGrid({
  kitchens,
  searchTerm,
  state,
  message,
  onSelectKitchen,
  onRetry,
  onManageAddress,
}: KitchensGridProps) {
  const normalizedSearch = searchTerm.trim();

  return (
    <section
      className="mx-auto max-w-7xl px-4 pb-10 pt-5 md:px-6"
      aria-labelledby="nearby-kitchens-heading"
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id="nearby-kitchens-heading"
            className="font-display text-2xl font-bold tracking-[-0.035em] text-ink md:text-3xl"
          >
            Home chefs near you
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Explore nearby kitchens and open their live menu.</p>
        </div>
        {state === "ready" ? (
          <span className="rounded-full bg-[#F1F3F5] px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            {kitchens.length} {kitchens.length === 1 ? "kitchen" : "kitchens"}
          </span>
        ) : null}
      </div>

      {state === "loading" ? (
        <div>
          <p className="sr-only" role="status">Loading nearby kitchens</p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => <KitchenSkeleton key={index} />)}
          </div>
        </div>
      ) : null}

      {state === "address-required" ? (
        <div className="rounded-2xl border border-[#ECEDEF] bg-white p-8 text-center shadow-[var(--shadow-card)] md:p-12">
          <MapPin className="mx-auto h-10 w-10 text-[#F62E18]" aria-hidden="true" />
          <h3 className="mt-4 font-display text-xl font-bold text-ink">Choose your delivery location</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{message}</p>
          <button type="button" onClick={onManageAddress} className="btn-primary mt-6">
            Manage delivery addresses
          </button>
        </div>
      ) : null}

      {state === "error" ? (
        <div className="rounded-2xl border border-error/20 bg-white p-8 text-center shadow-[var(--shadow-card)] md:p-12">
          <AlertTriangle className="mx-auto h-10 w-10 text-error" aria-hidden="true" />
          <h3 className="mt-4 font-display text-xl font-bold text-ink">Nearby kitchens could not be loaded</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{message}</p>
          <button type="button" onClick={onRetry} className="btn-primary mt-6">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
          </button>
        </div>
      ) : null}

      {state === "ready" && kitchens.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#D9DCDF] bg-[#FAFAFA] p-8 text-center md:p-10">
          <SearchX className="mx-auto h-9 w-9 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-4 font-display text-lg font-bold text-ink">
            {normalizedSearch ? "No kitchens match your search" : "No nearby kitchens found"}
          </h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            {normalizedSearch
              ? `No nearby kitchen matches “${normalizedSearch}”. Try another search.`
              : message || "No active home kitchens are available for this delivery location yet."}
          </p>
          {!normalizedSearch ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-5 min-h-11 rounded-xl border border-[#F62E18] px-4 text-sm font-semibold text-[#C92716] hover:bg-[#FFF3F0]"
            >
              Refresh nearby kitchens
            </button>
          ) : null}
        </div>
      ) : null}

      {state === "ready" && kitchens.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {kitchens.map((kitchen) => {
            const name = kitchen.displayName || kitchen.kitchenName;
            const location = [kitchen.areaName, kitchen.city].filter(Boolean).join(", ");

            return (
              <article
                key={kitchen.id}
                className="group flex min-h-[11rem] overflow-hidden rounded-2xl border border-[#ECEDEF] bg-white shadow-[0_8px_24px_rgba(17,17,17,0.05)] transition duration-200 hover:-translate-y-0.5 hover:border-[#F62E18]/25"
              >
                <div className="flex w-[7.5rem] shrink-0 items-center justify-center bg-[#F1F3F5] sm:w-[8.5rem]">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#F62E18] shadow-sm">
                    <ChefHat className="h-8 w-8" strokeWidth={1.9} aria-hidden="true" />
                  </span>
                </div>

                <div className="flex min-w-0 flex-1 flex-col p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="truncate font-display text-lg font-bold tracking-[-0.025em] text-ink">{name}</h3>
                    <span className="shrink-0 rounded-full bg-[#F1F3F5] px-2.5 py-1 text-[0.68rem] font-semibold text-muted-foreground">
                      {formatDistance(kitchen.distanceMeters)}
                    </span>
                  </div>

                  <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-[#F62E18]" aria-hidden="true" />
                    <span className="truncate">{location || `${kitchen.city}, ${kitchen.state}`}</span>
                  </p>

                  <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-ink">
                    <Utensils className="h-3.5 w-3.5 text-[#F62E18]" aria-hidden="true" />
                    {kitchen.activeMenuItemCount} active {kitchen.activeMenuItemCount === 1 ? "dish" : "dishes"}
                  </p>

                  <button
                    type="button"
                    onClick={() => onSelectKitchen(kitchen)}
                    className="mt-auto inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-full border border-[#F62E18]/35 px-4 text-xs font-bold text-[#C92716] transition-colors hover:bg-[#FFF3F0]"
                  >
                    View Kitchen
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

export default KitchensGrid;

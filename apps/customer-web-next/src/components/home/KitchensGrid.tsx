import {
  AlertTriangle,
  ArrowUpRight,
  ChefHat,
  MapPin,
  RefreshCw,
  SearchX,
  UtensilsCrossed,
} from "lucide-react";

import { formatDistance, type NearbyKitchen } from "@/lib/discovery-contract";
import styles from "@/screens/public/BrowseFoods/HomeReference.module.css";

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
    <div className="rounded-[1.8rem] border border-[#E9DBD1] bg-[#FFFDFC] p-5" aria-hidden="true">
      <div className="h-16 w-16 animate-pulse rounded-[1.25rem] bg-[#F0E5DB]" />
      <div className="mt-5 h-5 w-2/3 animate-pulse rounded-full bg-[#F0E5DB]" />
      <div className="mt-3 h-3.5 w-1/2 animate-pulse rounded-full bg-[#F0E5DB]" />
      <div className="mt-5 h-10 w-full animate-pulse rounded-full bg-[#F0E5DB]" />
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
      className={`${styles.fadeUp} mx-auto max-w-[88rem] px-4 pb-12 pt-10 md:px-7 lg:px-10 lg:pb-16 lg:pt-14`}
      aria-labelledby="nearby-kitchens-heading"
    >
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-[#F62E18]">
            From real home kitchens
          </p>
          <h2
            id="nearby-kitchens-heading"
            className="mt-1.5 font-display text-3xl font-black tracking-[-0.045em] text-[#261A15] md:text-4xl"
          >
            Home chefs near you
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#806B62]">
            Explore nearby kitchens, see what they are cooking and open their live menu.
          </p>
        </div>
        {state === "ready" ? (
          <span className="rounded-full border border-[#E7D8CE] bg-[#FFF8F1] px-3.5 py-2 text-xs font-black text-[#705A50]">
            {kitchens.length} {kitchens.length === 1 ? "kitchen" : "kitchens"}
          </span>
        ) : null}
      </div>

      {state === "loading" ? (
        <div>
          <p className="sr-only" role="status">Loading nearby kitchens</p>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => <KitchenSkeleton key={index} />)}
          </div>
        </div>
      ) : null}

      {state === "address-required" ? (
        <div className="rounded-[2rem] border border-[#E9D8CD] bg-[#FFF8F1] p-8 text-center md:p-12">
          <MapPin className="mx-auto h-9 w-9 fill-[#F62E18] text-[#F62E18]" strokeWidth={1.5} aria-hidden="true" />
          <h3 className="mt-4 font-display text-xl font-black text-[#261A15]">Choose your delivery location</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#806B62]">{message}</p>
          <button type="button" onClick={onManageAddress} className="mt-6 min-h-11 rounded-full bg-[#F62E18] px-5 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-[#D92B18]">
            Choose location
          </button>
        </div>
      ) : null}

      {state === "error" ? (
        <div className="rounded-[2rem] border border-[#F0D7D3] bg-[#FFF9F7] p-8 text-center md:p-12">
          <AlertTriangle className="mx-auto h-9 w-9 text-[#B3261E]" aria-hidden="true" />
          <h3 className="mt-4 font-display text-xl font-black text-[#261A15]">Nearby kitchens could not be loaded</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#806B62]">{message}</p>
          <button type="button" onClick={onRetry} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#F62E18] px-5 text-sm font-black text-[#D82D1B] transition hover:bg-[#F62E18] hover:text-white">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
        </div>
      ) : null}

      {state === "ready" && kitchens.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-[#DCCBC0] bg-[#FFF9F3] p-8 text-center md:p-10">
          <SearchX className="mx-auto h-9 w-9 text-[#9C857A]" aria-hidden="true" />
          <h3 className="mt-4 font-display text-lg font-black text-[#261A15]">
            {normalizedSearch ? "No kitchens match your search" : "No nearby kitchens found"}
          </h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#806B62]">
            {normalizedSearch
              ? `No nearby kitchen matches “${normalizedSearch}”. Try another search.`
              : message || "No active home kitchens are available for this delivery location yet."}
          </p>
          {!normalizedSearch ? (
            <button type="button" onClick={onRetry} className="mt-5 min-h-10 rounded-full border border-[#E4C7B8] bg-white px-4 text-xs font-black text-[#C92716] transition hover:border-[#F62E18]">
              Refresh nearby kitchens
            </button>
          ) : null}
        </div>
      ) : null}

      {state === "ready" && kitchens.length > 0 ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {kitchens.map((kitchen, index) => {
            const name = kitchen.kitchenName;
            const location = [kitchen.areaName, kitchen.city].filter(Boolean).join(", ");
            return (
              <article
                key={kitchen.id}
                className={`group relative overflow-hidden rounded-[1.85rem] border border-[#E9DBD1] bg-[#FFFDFC] p-5 shadow-[0_12px_36px_rgba(61,40,31,0.065)] transition duration-300 hover:-translate-y-1 hover:border-[#F62E18]/25 hover:shadow-[0_18px_42px_rgba(61,40,31,0.10)] ${index % 2 === 1 ? "md:translate-y-3 md:hover:translate-y-2" : ""}`}
              >
                <span className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full border-[18px] border-[#F9E9DD]" aria-hidden="true" />
                <div className="relative flex items-start gap-4">
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[1.35rem] border border-[#E8D5C7] bg-[#FFF3E8] text-[#F62E18] transition duration-300 group-hover:rotate-[-3deg] group-hover:scale-105">
                    <ChefHat className="h-8 w-8" strokeWidth={1.7} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="min-w-0 truncate font-display text-xl font-black tracking-[-0.03em] text-[#261A15]">
                        {name}
                      </h3>
                      <span className="shrink-0 rounded-full bg-[#F3EAE3] px-2.5 py-1 text-[0.65rem] font-black text-[#745E54]">
                        {formatDistance(kitchen.distanceMeters)}
                      </span>
                    </div>
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-[#8A746A]">
                      <MapPin className="h-3.5 w-3.5 shrink-0 fill-[#F62E18] text-[#F62E18]" strokeWidth={1.4} aria-hidden="true" />
                      <span className="truncate">{location || `${kitchen.city}, ${kitchen.state}`}</span>
                    </p>
                  </div>
                </div>

                {kitchen.description ? (
                  <p className="relative mt-4 line-clamp-2 text-sm leading-5.5 text-[#756159]">{kitchen.description}</p>
                ) : null}

                <div className="relative mt-5 flex items-center justify-between gap-3 border-t border-dashed border-[#E4D5CB] pt-4">
                  <span className="inline-flex items-center gap-1.5 text-xs font-black text-[#5F4B43]">
                    <UtensilsCrossed className="h-4 w-4 text-[#F62E18]" aria-hidden="true" />
                    {kitchen.activeMenuItemCount} active {kitchen.activeMenuItemCount === 1 ? "dish" : "dishes"}
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelectKitchen(kitchen)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[#261A15] px-4 text-xs font-black text-white transition duration-200 hover:-translate-y-0.5 hover:bg-[#F62E18]"
                  >
                    Open
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
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

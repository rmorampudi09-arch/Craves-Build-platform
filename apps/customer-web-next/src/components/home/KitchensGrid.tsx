import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  ChefHat,
  ChevronLeft,
  ChevronRight,
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
  dishImagesByKitchen?: Record<string, string[]>;
}

function KitchenSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-[1.45rem] border border-[#E5E7EB] bg-white"
      aria-hidden="true"
    >
      <div className="aspect-[16/10] animate-pulse bg-[#F1F3F5]" />
      <div className="p-4">
        <div className="h-5 w-2/3 animate-pulse rounded-full bg-[#F1F3F5]" />
        <div className="mt-3 h-3.5 w-1/2 animate-pulse rounded-full bg-[#F1F3F5]" />
        <div className="mt-5 h-10 w-full animate-pulse rounded-full bg-[#F1F3F5]" />
      </div>
    </div>
  );
}

function KitchenDishPreview({
  name,
  images,
}: {
  name: string;
  images: string[];
}) {
  const usable = Array.from(new Set(images.filter(Boolean))).slice(0, 5);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [images]);

  useEffect(() => {
    if (usable.length <= 1) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) return;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % usable.length);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [usable.length]);

  if (!usable.length) {
    return (
      <div className="flex aspect-[16/10] items-center justify-center bg-[#F1F3F5] text-[#F62E18]">
        <ChefHat className="h-12 w-12" strokeWidth={1.6} aria-hidden="true" />
      </div>
    );
  }

  const showPrevious = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveIndex((current) => (current - 1 + usable.length) % usable.length);
  };

  const showNext = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveIndex((current) => (current + 1) % usable.length);
  };

  return (
    <div className={styles.kitchenPreviewViewport}>
      <img
        key={usable[activeIndex]}
        src={usable[activeIndex]}
        alt={`${name} dish preview ${activeIndex + 1} of ${usable.length}`}
        loading="lazy"
        decoding="async"
        className={styles.kitchenPreviewImage}
      />

      {usable.length > 1 ? (
        <>
          <button
            type="button"
            onClick={showPrevious}
            className="absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/80 bg-white/85 text-[#1A1A1A] shadow-[0_6px_18px_rgba(26,26,26,0.14)] backdrop-blur-md transition-[background-color,box-shadow] hover:bg-white hover:shadow-[0_8px_22px_rgba(26,26,26,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/35"
            aria-label={`Show previous dish from ${name}`}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={showNext}
            className="absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/80 bg-white/85 text-[#1A1A1A] shadow-[0_6px_18px_rgba(26,26,26,0.14)] backdrop-blur-md transition-[background-color,box-shadow] hover:bg-white hover:shadow-[0_8px_22px_rgba(26,26,26,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/35"
            aria-label={`Show next dish from ${name}`}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <div
            className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1 rounded-full bg-black/25 px-2 py-1 backdrop-blur-sm"
            aria-hidden="true"
          >
            {usable.map((src, index) => (
              <span
                key={src}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  index === activeIndex ? "w-4 bg-white" : "w-1.5 bg-white/60"
                }`}
              />
            ))}
          </div>
        </>
      ) : null}
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
  dishImagesByKitchen = {},
}: KitchensGridProps) {
  const normalizedSearch = searchTerm.trim();

  return (
    <section
      className="mx-auto max-w-[88rem] px-4 pb-10 pt-7 md:px-7 md:pt-9 lg:px-10 lg:pb-14 lg:pt-10"
      aria-labelledby="nearby-kitchens-heading"
    >
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-[#F62E18]">
            From real home kitchens
          </p>
          <h2
            id="nearby-kitchens-heading"
            className="mt-1.5 font-display text-3xl font-black tracking-[-0.045em] text-[#1A1A1A] md:text-3xl lg:text-4xl"
          >
            Home chefs near you
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#6B6B6B]">
            Browse nearby home chefs through the dishes they are cooking today.
          </p>
        </div>
        {state === "ready" ? (
          <span className="rounded-full bg-[#F1F3F5] px-3.5 py-2 text-xs font-black text-[#6B6B6B]">
            {kitchens.length} {kitchens.length === 1 ? "chef" : "chefs"}
          </span>
        ) : null}
      </div>

      {state === "loading" ? (
        <div>
          <p className="sr-only" role="status">Loading nearby kitchens</p>
          <div className={styles.kitchenGrid}>
            {Array.from({ length: 6 }, (_, index) => (
              <KitchenSkeleton key={index} />
            ))}
          </div>
        </div>
      ) : null}

      {state === "address-required" ? (
        <div className="rounded-[2rem] border border-[#E5E7EB] bg-white p-8 text-center md:p-12">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
            <MapPin className="h-6 w-6 fill-current" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <h3 className="mt-4 font-display text-xl font-black text-[#1A1A1A]">Choose your delivery location</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#6B6B6B]">{message}</p>
          <button type="button" onClick={onManageAddress} className="mt-6 min-h-11 rounded-full bg-[#F62E18] px-5 text-sm font-black text-white transition-shadow hover:shadow-[0_7px_18px_rgba(246,46,24,0.16)]">Choose location</button>
        </div>
      ) : null}

      {state === "error" ? (
        <div className="rounded-[2rem] border border-[#F62E18]/25 bg-white p-8 text-center md:p-12">
          <AlertTriangle className="mx-auto h-9 w-9 text-[#F62E18]" aria-hidden="true" />
          <h3 className="mt-4 font-display text-xl font-black text-[#1A1A1A]">Nearby kitchens could not be loaded</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#6B6B6B]">{message}</p>
          <button type="button" onClick={onRetry} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#F62E18] bg-white px-5 text-sm font-black text-[#F62E18] transition hover:bg-[#F62E18] hover:text-white">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
          </button>
        </div>
      ) : null}

      {state === "ready" && kitchens.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-[#E5E7EB] bg-[#F1F3F5] p-8 text-center md:p-10">
          <SearchX className="mx-auto h-9 w-9 text-[#6B6B6B]" aria-hidden="true" />
          <h3 className="mt-4 font-display text-lg font-black text-[#1A1A1A]">
            {normalizedSearch ? "No chefs match your search" : "No nearby chefs found"}
          </h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#6B6B6B]">
            {normalizedSearch
              ? `No nearby chef matches “${normalizedSearch}”. Try another search.`
              : message || "No active home kitchens are available for this delivery location yet."}
          </p>
          {!normalizedSearch ? (
            <button type="button" onClick={onRetry} className="mt-5 min-h-10 rounded-full border border-[#F62E18] bg-white px-4 text-xs font-black text-[#F62E18] transition hover:bg-[#F62E18] hover:text-white">Refresh nearby chefs</button>
          ) : null}
        </div>
      ) : null}

      {state === "ready" && kitchens.length > 0 ? (
        <div className={styles.kitchenGrid}>
          {kitchens.map((kitchen) => {
            const name = kitchen.displayName || kitchen.kitchenName;
            const location = [kitchen.areaName, kitchen.city].filter(Boolean).join(", ");
            const previews = dishImagesByKitchen[kitchen.id] ?? [];
            return (
              <article
                key={kitchen.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectKitchen(kitchen)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectKitchen(kitchen);
                  }
                }}
                className="group cursor-pointer overflow-hidden rounded-[1.45rem] border border-[#E5E7EB] bg-white text-left text-[#1A1A1A] shadow-[0_8px_28px_rgba(26,26,26,0.07)] transition-[border-color,box-shadow] duration-300 hover:border-[#F62E18]/25 hover:shadow-[0_18px_42px_rgba(26,26,26,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/30"
                aria-label={`Open ${name}`}
              >
                  <KitchenDishPreview name={name} images={previews} />
                  <div className="p-4 sm:p-4.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-display text-lg font-black tracking-[-0.025em] text-[#1A1A1A]">
                          {name}
                        </h3>
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-bold text-[#6B6B6B]">
                          <MapPin className="h-3.5 w-3.5 shrink-0 fill-[#F62E18] text-[#F62E18]" strokeWidth={1.4} aria-hidden="true" />
                          <span className="truncate">{location || `${kitchen.city}, ${kitchen.state}`}</span>
                        </p>
                      </div>
                      <span className="shrink-0 rounded-lg bg-[#F1F3F5] px-2.5 py-1.5 text-[0.68rem] font-black text-[#1A1A1A]">
                        {formatDistance(kitchen.distanceMeters)}
                      </span>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#F1F3F5] pt-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-black text-[#1A1A1A]">
                        <UtensilsCrossed className="h-4 w-4 text-[#F62E18]" aria-hidden="true" />
                        {kitchen.activeMenuItemCount} active {kitchen.activeMenuItemCount === 1 ? "dish" : "dishes"}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-black text-[#F62E18]">
                        View chef <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                    </div>
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

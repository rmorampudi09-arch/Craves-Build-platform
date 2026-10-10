import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChefHat,
  MapPin,
  RefreshCw,
  SearchX,
  UtensilsCrossed,
} from "lucide-react";

import { formatDistance, type NearbyKitchen } from "@/lib/discovery-contract";
import styles from "@/screens/public/BrowseFoods/HomeReference.module.css";
import skeletonStyles from "@/components/loading/CustomerPageSkeleton.module.css";

type DiscoveryState = "loading" | "ready" | "error" | "address-required";

const kitchenImagePreloads = new Map<string, Promise<boolean>>();

function preloadKitchenImage(src: string): Promise<boolean> {
  const existing = kitchenImagePreloads.get(src);
  if (existing) return existing;

  const pending = new Promise<boolean>((resolve) => {
    const image = new window.Image();
    image.decoding = "async";
    image.src = src;

    const success = () => resolve(true);
    if (image.complete && image.naturalWidth > 0) {
      void image.decode().catch(() => undefined).finally(success);
      return;
    }

    image.onload = () => {
      void image.decode().catch(() => undefined).finally(success);
    };
    image.onerror = () => {
      kitchenImagePreloads.delete(src);
      resolve(false);
    };
  });

  kitchenImagePreloads.set(src, pending);
  return pending;
}

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
      <div className={`${skeletonStyles.block} aspect-[16/9]`} />
      <div className="p-4">
        <div className={`${skeletonStyles.block} h-5 w-2/3 rounded-full`} />
        <div className={`${skeletonStyles.block} ${skeletonStyles.soft} mt-3 h-3.5 w-1/2 rounded-full`} />
        <div className={`${skeletonStyles.block} mt-5 h-10 w-full rounded-[0.8rem]`} />
      </div>
    </div>
  );
}

function KitchenDishPreview({
  name,
  images,
  priority = false,
}: {
  name: string;
  images: string[];
  priority?: boolean;
}) {
  const usable = useMemo(
    () => Array.from(new Set(images.filter(Boolean))).slice(0, 5),
    [images],
  );
  const stripRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Warm the cache for the other photos once the card nears the viewport, so
  // a swipe never reveals an empty slide. No autoplay (WCAG 2.2.2).
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || usable.length <= 1 || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        for (const src of usable.slice(1)) void preloadKitchenImage(src);
      },
      { rootMargin: "520px 0px" },
    );
    observer.observe(strip);
    return () => observer.disconnect();
  }, [usable]);

  if (!usable.length) {
    return (
      <div className="flex aspect-[16/9] items-center justify-center bg-[#F1F3F5] text-[#F62E18]">
        <ChefHat className="h-12 w-12" strokeWidth={1.6} aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="relative aspect-[16/9] overflow-hidden bg-[#F1F3F5]">
      {/* A native snap strip: the photo follows the finger and settles on release. */}
      <div
        ref={stripRef}
        onScroll={(event) => {
          const strip = event.currentTarget;
          if (strip.clientWidth > 0) {
            setActiveIndex(Math.round(strip.scrollLeft / strip.clientWidth));
          }
        }}
        className="flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {usable.map((src, index) => (
          <img
            key={src}
            src={src}
            alt={
              index === activeIndex
                ? `${name} dish preview ${index + 1} of ${usable.length}`
                : ""
            }
            aria-hidden={index === activeIndex ? undefined : true}
            loading={index === 0 && priority ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={priority && index === 0 ? "high" : "auto"}
            draggable={false}
            className="h-full w-full shrink-0 snap-center snap-always object-cover"
          />
        ))}
      </div>

      {usable.length > 1 ? (
        <div
          className="pointer-events-none absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#1A1A1A]/35 px-2 py-1.5"
          aria-hidden="true"
        >
          {usable.map((src, index) => (
            <span
              key={src}
              className={`h-1.5 w-1.5 rounded-full bg-white transition-[opacity,scale] duration-(--dur-component) ease-out ${
                index === activeIndex ? "scale-125 opacity-100" : "opacity-55"
              }`}
            />
          ))}
        </div>
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
      className="mx-auto max-w-[88rem] px-4 pb-3 pt-3 md:px-7 md:pb-4 md:pt-4 lg:px-10 lg:pb-5 lg:pt-5"
      aria-labelledby="nearby-kitchens-heading"
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-4">
        <div>
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
          <button type="button" onClick={onManageAddress} className="mt-6 min-h-11 rounded-full bg-[#F62E18] px-5 text-sm font-black text-white transition-shadow hover:shadow-[0_7px_18px_rgba(26,26,26,0.14)]">Choose location</button>
        </div>
      ) : null}

      {state === "error" ? (
        <div className="rounded-[2rem] border border-[#E5E7EB] bg-white p-8 text-center md:p-12">
          <AlertTriangle className="mx-auto h-9 w-9 text-[#F62E18]" aria-hidden="true" />
          <h3 className="mt-4 font-display text-xl font-black text-[#1A1A1A]">Nearby kitchens could not be loaded</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#6B6B6B]">{message}</p>
          <button type="button" onClick={onRetry} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#F62E18] bg-white px-5 text-sm font-black text-[#F62E18] transition-colors hover:bg-[#F62E18] hover:text-white">
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
            <button type="button" onClick={onRetry} className="mt-5 min-h-10 rounded-full border border-[#F62E18] bg-white px-4 text-xs font-black text-[#F62E18] transition-colors hover:bg-[#F62E18] hover:text-white">Refresh nearby chefs</button>
          ) : null}
        </div>
      ) : null}

      {state === "ready" && kitchens.length > 0 ? (
        <div className={styles.kitchenGrid}>
          {kitchens.map((kitchen, index) => {
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
                className="group cursor-pointer overflow-hidden rounded-[1.35rem] border border-[#E5E7EB] bg-white text-left text-[#1A1A1A] shadow-[0_7px_22px_rgba(26,26,26,0.065)] transition-[border-color,box-shadow] duration-300 hover:border-[#D7DADF] hover:shadow-[0_14px_32px_rgba(26,26,26,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/30"
                aria-label={`Open ${name}`}
              >
                  <KitchenDishPreview name={name} images={previews} priority={index < 4} />
                  <div className="px-3.5 pb-2.5 pt-2.5 sm:px-4 sm:pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-display text-base font-black tracking-[-0.02em] text-[#1A1A1A] sm:text-[1.05rem]">
                          {name}
                        </h3>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[0.7rem] font-bold text-[#6B6B6B] sm:text-xs">
                          <MapPin className="h-3.5 w-3.5 shrink-0 fill-[#F62E18] text-[#F62E18]" strokeWidth={1.4} aria-hidden="true" />
                          <span className="truncate">{location || `${kitchen.city}, ${kitchen.state}`}</span>
                        </p>
                      </div>
                      <span className="shrink-0 rounded-lg bg-[#F1F3F5] px-2.5 py-1 text-[0.66rem] font-black text-[#1A1A1A]">
                        {formatDistance(kitchen.distanceMeters)}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center border-t border-[#F1F3F5] pt-2">
                      <span className="inline-flex items-center gap-1.5 text-[0.7rem] font-black text-[#1A1A1A] sm:text-xs">
                        <UtensilsCrossed className="h-4 w-4 text-[#F62E18]" aria-hidden="true" />
                        {kitchen.activeMenuItemCount} active {kitchen.activeMenuItemCount === 1 ? "dish" : "dishes"}
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

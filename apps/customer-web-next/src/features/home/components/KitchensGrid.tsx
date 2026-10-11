import { useEffect, useLayoutEffect, useMemo, useRef, useState, type UIEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  ChefHat,
  MapPin,
  Pause,
  Play,
  RefreshCw,
  SearchX,
  UtensilsCrossed,
} from "lucide-react";

import { formatDistance, type NearbyKitchen } from "@/features/home/lib/discovery-contract";
import styles from "@/features/home/screens/HomeReference.module.css";
import skeletonStyles from "@/shared/components/loading/CustomerPageSkeleton.module.css";

type DiscoveryState = "loading" | "ready" | "error" | "address-required";

/** How long each photo stays before the next one slides in. */
const SLIDE_MS = 3200;
/** The customer's Pause photos choice, kept for their next visit. */
const PHOTOS_PAUSED_KEY = "craves.kitchen-photos.paused";
/** Phones show this many kitchens on Home; wider screens show `limit`. */
const PHONE_LIMIT = 4;

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
  /** Home shows the nearest few and links to every chef; the chefs page shows all. */
  limit?: number;
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
  autoplay = false,
  order = 0,
}: {
  name: string;
  images: string[];
  priority?: boolean;
  autoplay?: boolean;
  order?: number;
}) {
  // A photo that fails to load leaves the slideshow instead of showing a broken image.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const usable = useMemo(
    () => Array.from(new Set(images.filter((src) => src && !failed.has(src)))).slice(0, 5),
    [images, failed],
  );
  const count = usable.length;
  const stripRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLImageElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [onScreen, setOnScreen] = useState(false);
  // A swipe means the customer is choosing: the slideshow stops for this card (APG carousel).
  const [swiped, setSwiped] = useState(false);
  const [firstShown, setFirstShown] = useState(false);
  const moving = useRef(false);
  const settle = useRef(0);

  // A cached first photo shows at once; a fresh one fades in when it arrives (like dish cards).
  useLayoutEffect(() => {
    const image = firstRef.current;
    if (image?.complete && image.naturalWidth > 0) setFirstShown(true);
  }, [usable]);

  // Slides run only while most of the card is on screen.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || count <= 1 || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(Boolean(entry && entry.intersectionRatio >= 0.6)),
      { threshold: [0, 0.6] },
    );
    observer.observe(strip);
    return () => observer.disconnect();
  }, [count]);

  // Only the next photo is fetched ahead, so it is ready before it slides in.
  useEffect(() => {
    if (onScreen && count > 1) void preloadKitchenImage(usable[(activeIndex + 1) % count]);
  }, [activeIndex, count, onScreen, usable]);

  // The photo moves left and the next one follows; after the last comes the first again.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || !autoplay || !onScreen || swiped || count <= 1) return;
    const advance = () => {
      // Hovering, keyboard focus on the card, or a hidden tab holds the current photo.
      if (document.hidden || strip.closest("article")?.matches(":hover, :focus-within")) return;
      const width = strip.clientWidth;
      if (!width) return;
      moving.current = true;
      strip.scrollTo({ left: (Math.round(strip.scrollLeft / width) + 1) * width, behavior: "smooth" });
    };
    let timer = 0;
    // Cards side by side take turns instead of moving together.
    const start = window.setTimeout(() => {
      advance();
      timer = window.setInterval(advance, SLIDE_MS);
    }, SLIDE_MS + (order % 3) * 900);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(timer);
    };
  }, [autoplay, count, onScreen, order, swiped]);

  useEffect(() => () => window.clearTimeout(settle.current), []);

  const onStripScroll = (event: UIEvent<HTMLDivElement>) => {
    const strip = event.currentTarget;
    const width = strip.clientWidth;
    if (!width) return;
    setActiveIndex(Math.round(strip.scrollLeft / width) % count);
    if (!moving.current) setSwiped(true);
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      if (Math.round(strip.scrollLeft / width) >= count) {
        // Resting on the copy of the first photo: step to the real one (they look the same).
        moving.current = true;
        strip.scrollTo({ left: 0, behavior: "instant" });
      }
      moving.current = false;
    }, 140);
  };

  if (!count) {
    return (
      <div className="flex aspect-[16/9] items-center justify-center bg-[#F1F3F5] text-[#F62E18]">
        <ChefHat className="h-12 w-12" strokeWidth={1.6} aria-hidden="true" />
      </div>
    );
  }

  const slide = "h-full w-full shrink-0 snap-center snap-always object-cover";
  return (
    <div className="relative aspect-[16/9] overflow-hidden bg-[#F1F3F5]">
      {/* A native snap strip: the photo follows the finger and settles on release. */}
      <div
        ref={stripRef}
        onScroll={onStripScroll}
        className="flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {usable.map((src, index) => (
          <img
            key={src}
            ref={index === 0 ? firstRef : undefined}
            src={src}
            alt={
              index === activeIndex
                ? `${name} dish preview ${index + 1} of ${count}`
                : ""
            }
            aria-hidden={index === activeIndex ? undefined : true}
            loading={index === 0 && priority ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={priority && index === 0 ? "high" : "auto"}
            draggable={false}
            onLoad={index === 0 ? () => setFirstShown(true) : undefined}
            onError={() => setFailed((current) => new Set(current).add(src))}
            className={
              index === 0
                ? `${slide} transition-opacity duration-300 ${firstShown ? "opacity-100" : "opacity-0"}`
                : slide
            }
          />
        ))}
        {/* After the last photo the first one comes round again from the right. */}
        {count > 1 ? (
          <img src={usable[0]} alt="" aria-hidden="true" loading="lazy" decoding="async" draggable={false} className={slide} />
        ) : null}
      </div>

      {count > 1 ? (
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
  limit,
}: KitchensGridProps) {
  const normalizedSearch = searchTerm.trim();
  const shownKitchens = limit ? kitchens.slice(0, limit) : kitchens;
  // Moving photos can be paused (WCAG 2.2.2) and never move for reduced motion.
  const reduceMotion = useReducedMotion();
  const [photosPaused, setPhotosPaused] = useState(false);
  useEffect(() => {
    try {
      setPhotosPaused(window.localStorage.getItem(PHOTOS_PAUSED_KEY) === "1");
    } catch {
      // Storage blocked: photos move, and the button still pauses them for this visit.
    }
  }, []);
  const togglePhotos = () => {
    const next = !photosPaused;
    setPhotosPaused(next);
    try {
      window.localStorage.setItem(PHOTOS_PAUSED_KEY, next ? "1" : "0");
    } catch {
      // The choice still holds for this visit.
    }
  };
  const slideshow =
    !reduceMotion &&
    shownKitchens.some((kitchen) => (dishImagesByKitchen[kitchen.id]?.length ?? 0) > 1);

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
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#F1F3F5] px-3.5 py-2 text-xs font-black text-[#6B6B6B]">
              {kitchens.length} {kitchens.length === 1 ? "chef" : "chefs"}
            </span>
            {slideshow ? (
              <button
                type="button"
                onClick={togglePhotos}
                className="inline-flex min-h-[2rem] items-center gap-1.5 rounded-full !border !border-[#E5E7EB] !bg-white px-3 text-xs font-black !text-[#1A1A1A] !shadow-none transition-[scale] duration-(--dur-micro) active:scale-[0.96]"
              >
                {photosPaused ? (
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {photosPaused ? "Play photos" : "Pause photos"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {state === "loading" ? (
        <div>
          <p className="sr-only" role="status">Loading nearby kitchens</p>
          <div className={styles.kitchenGrid}>
            {/* As many placeholders as cards will show, so the list doesn't shrink when it loads. */}
            {Array.from({ length: limit ?? 6 }, (_, index) => (
              <div key={index} className={limit && index >= PHONE_LIMIT ? "max-sm:hidden" : undefined}>
                <KitchenSkeleton />
              </div>
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
          {shownKitchens.map((kitchen, index) => {
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
                className={`${limit && index >= PHONE_LIMIT ? "max-sm:hidden " : ""}group cursor-pointer overflow-hidden rounded-[1.35rem] border border-[#E5E7EB] bg-white text-left text-[#1A1A1A] shadow-[0_7px_22px_rgba(26,26,26,0.065)] transition-[border-color,box-shadow] duration-300 hover:border-[#D7DADF] hover:shadow-[0_14px_32px_rgba(26,26,26,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/30`}
                aria-label={`Open ${name}`}
              >
                  <KitchenDishPreview
                    name={name}
                    images={previews}
                    priority={index < 4}
                    autoplay={slideshow && !photosPaused}
                    order={index}
                  />
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

      {state === "ready" && limit && kitchens.length > PHONE_LIMIT ? (
        <div className={`mt-4 flex justify-center${kitchens.length > limit ? "" : " sm:hidden"}`}>
          {/* Phones show four kitchens and wider screens `limit`; every chef is one tap away. */}
          <Link
            to="/chefs"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-5 text-sm font-black text-[#1A1A1A] transition-colors hover:bg-[#F1F3F5]"
          >
            See all {kitchens.length} home chefs
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      ) : null}
    </section>
  );
}

export default KitchensGrid;

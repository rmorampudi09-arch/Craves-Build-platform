import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useReducedMotion } from "framer-motion";
import {
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Heart,
  MapPin,
  Pause,
  Play,
  RefreshCw,
} from "lucide-react";

import type { NearbyKitchen } from "@/features/home/lib/discovery-contract";
import { scrollRow, useRowEdges } from "@/features/home/lib/row-scroll";
import styles from "@/features/home/screens/HomeReference.module.css";
import { KitchenDiscoverCardSkeleton } from "@/shared/components/loading/CustomerPageSkeleton";
import skeletonStyles from "@/shared/components/loading/CustomerPageSkeleton.module.css";
import { useFavoriteKitchen } from "@/shared/hooks/use-favorite-kitchen";
import { safeChefPhotoUrl } from "@/shared/lib/chef-photo";
import { summarizeKitchenDishes, type KitchenCardDish, type KitchenDishSummary } from "@/shared/lib/kitchen-dish-summary";
import { EmptyState, emptyStateSecondaryAction } from "@/shared/ui/feedback/EmptyState";

type DiscoveryState = "loading" | "ready" | "error" | "address-required";

/** Each kitchen photo stays this long before the next one fades in over it (as in the app). */
const PHOTO_MS = 4_000;
/** Cards side by side change photos this far apart, so the row never flips at once (as in the app). */
const PHOTO_STAGGER_MS = 800;
/** The customer's Pause photos choice, kept for their next visit. */
const PHOTOS_PAUSED_KEY = "craves.kitchen-photos.paused";
const DOTS = 5;
/** Glass over a photo, dark enough that white text keeps 4.5:1 even over a white plate. */
const GLASS = "bg-[#1A1A1A]/60 shadow-[0_2px_10px_rgba(26,26,26,0.18)] ring-1 ring-inset ring-white/25 backdrop-blur-md backdrop-saturate-150";
/** 74% of a phone's width (248–286 px, as in the app), so the next card peeks in; four across from lg. */
const CARD_WIDTH = "w-[clamp(248px,74vw,286px)] shrink-0 snap-start lg:w-[calc((100%_-_3.75rem)/4)]";
/** The row runs edge to edge on phones and tablets, and leaves room for focus rings and shadows. */
const ROW = "-mx-4 flex gap-3 px-4 pb-7 pt-2 md:-mx-7 md:px-7 lg:gap-5";
const HOME_HEADING = "font-display text-[1.375rem] font-black tracking-[-0.03em] text-[#1A1A1A] md:text-2xl lg:text-[1.75rem]";
const ARROW_BUTTON = "flex h-12 w-12 shrink-0 items-center justify-center rounded-full !border !border-[#E5E7EB] !bg-white !p-0 !text-[#1A1A1A] !shadow-none hover:!bg-[#F1F3F5]";

interface KitchensGridProps {
  kitchens: NearbyKitchen[];
  searchTerm: string;
  state: DiscoveryState;
  message: string;
  onSelectKitchen: (kitchen: NearbyKitchen) => void;
  onRetry: () => void;
  onManageAddress: () => void;
  /** The nearby dishes already loaded: each card's photos, prep time and starting price come from them. */
  dishes: readonly KitchenCardDish[];
  /** Home shows the nearest few in one row and links to every chef; the chefs page shows all. */
  limit?: number;
  /** The chefs page draws its own card in a grid; Home's row of cards is the default. */
  renderKitchen?: (kitchen: NearbyKitchen, summary: KitchenDishSummary | undefined, open: () => void) => ReactNode;
  /** The chefs page: how many kitchens cook within 10 km in all, when more pages are still to load. */
  totalNearby?: number;
}

/** The kitchen's dish photos: each fades in over the one before every 4 s, always forward; still for reduced motion. */
function KitchenPhotos({ images, autoplay, delayMs, priority }: { images: readonly string[]; autoplay: boolean; delayMs: number; priority: boolean }) {
  // A photo that fails to load leaves the slideshow instead of showing a broken image.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const photos = useMemo(() => images.filter((src) => !failed.has(src)), [images, failed]);
  const count = photos.length;
  const [shown, setShown] = useState({ index: 0, previous: -1 });
  const current = shown.index < count ? shown.index : 0;
  const previous = shown.previous < count ? shown.previous : -1;
  const rootRef = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(false);
  const playing = autoplay && onScreen && count > 1;
  // Photos load as the slideshow reaches them (the shown one and the next), never all at once.
  const [loadedUpTo, setLoadedUpTo] = useState(0);
  const needed = playing ? Math.min(count - 1, current + 1) : current;
  if (needed > loadedUpTo) setLoadedUpTo(needed);

  // Slides run only while most of the card is on screen.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !autoplay || count < 2 || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(Boolean(entry && entry.intersectionRatio >= 0.6)),
      { threshold: [0, 0.6] },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [autoplay, count]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !playing) return;
    const advance = () => {
      // A hidden tab, a pointer over the card or keyboard focus in it holds the current photo.
      if (document.hidden || root.closest("li")?.matches(":hover, :focus-within")) return;
      setShown(({ index }) => ({ index: (index + 1) % count, previous: index % count }));
    };
    let timer = 0;
    const start = window.setTimeout(() => {
      timer = window.setInterval(advance, PHOTO_MS);
    }, delayMs);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(timer);
    };
  }, [count, delayMs, playing]);

  if (!count) {
    return (
      <div className="flex aspect-[100/63] items-center justify-center rounded-t-[19px] bg-[#F7F5F3] text-[#D92714]">
        <ChefHat className="h-[34px] w-[34px]" strokeWidth={1.75} aria-hidden="true" />
      </div>
    );
  }

  const firstDot = Math.max(0, Math.min(current - 2, count - DOTS));
  return (
    <div ref={rootRef} className="relative aspect-[100/63] overflow-hidden rounded-t-[19px] bg-[#F7F5F3]">
      {photos.map((src, index) =>
        index > loadedUpTo ? null : (
          <img
            key={src}
            src={src}
            alt=""
            loading={index === 0 && priority ? "eager" : "lazy"}
            fetchPriority={index === 0 && priority ? "high" : "auto"}
            decoding="async"
            draggable={false}
            onError={() => setFailed((value) => new Set(value).add(src))}
            // The new photo fades in over the last one, which stays put underneath: no grey dip between photos.
            className={`absolute inset-0 h-full w-full object-cover ${
              index === current
                ? "z-[2] opacity-100 transition-opacity duration-[650ms] ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none"
                : index === previous
                  ? "z-[1] opacity-100"
                  : "opacity-0"
            }`}
          />
        ),
      )}
      {count > 1 ? (
        // Between the chef's face and the heart's column, as in the app.
        <div aria-hidden="true" className="pointer-events-none absolute bottom-3 left-[74px] right-[88px] z-[3] flex items-center justify-center gap-1.5">
          {photos.slice(firstDot, firstDot + DOTS).map((src, offset) => (
            <span
              key={src}
              className={`h-1.5 w-1.5 rounded-full shadow-[0_0_2px_rgba(26,26,26,0.55)] ${firstDot + offset === current ? "bg-white" : "bg-white/50"}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** The chef's picture fills a white circle over the photo's edge; without one, a grey circle with a chef hat. */
function ChefCircle({ photoUrl }: { photoUrl: string | null }) {
  const url = safeChefPhotoUrl(photoUrl);
  // Remember which url failed, so a new url gets its own try.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -bottom-8 left-3 z-[3] flex h-[70px] w-[70px] items-center justify-center overflow-hidden rounded-full bg-white shadow-[0_6px_14px_rgba(38,26,21,0.12)]"
    >
      {url && url !== failedUrl ? (
        <img src={url} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailedUrl(url)} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-16 w-16 items-center justify-center rounded-full border border-[#D5CEC8] bg-[#F7F5F3] text-[#1A1A1A]">
          <ChefHat className="h-[26px] w-[26px]" strokeWidth={1.75} />
        </span>
      )}
    </span>
  );
}

/** Saves the kitchen (the same saved kitchens as every other heart): a white outline, filled red once saved. */
function KitchenHeart({ kitchenId, name }: { kitchenId: string; name: string }) {
  const { saved, busy, toggle } = useFavoriteKitchen(kitchenId);
  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from saved` : `Save ${name}`}
      className="absolute right-3 top-3 z-[4] flex h-12 w-12 items-center justify-center rounded-full !border-0 !bg-transparent !p-0 !text-white !shadow-none disabled:!opacity-100"
    >
      <span aria-hidden="true" className={`absolute inset-0 rounded-full ${GLASS}`} />
      <Heart className={`relative h-6 w-6 ${saved ? "fill-[#F62E18]" : ""}`} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}

function TopKitchenCard({
  kitchen,
  summary,
  order,
  autoplay,
  onOpen,
}: {
  kitchen: NearbyKitchen;
  summary: KitchenDishSummary;
  order: number;
  autoplay: boolean;
  onOpen: () => void;
}) {
  const name = kitchen.kitchenName;
  return (
    // The heart is the card button's sibling, so neither control sits inside the other.
    <li className={`${CARD_WIDTH} group relative transition-[translate] duration-(--dur-component) ease-out motion-safe:hover:-translate-y-0.5`}>
      <div
        role="button"
        tabIndex={0}
        aria-label={`Open ${name}`}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
          }
        }}
        className="flex h-full cursor-pointer flex-col rounded-[20px] border !border-[#E3DDD8] bg-white text-left shadow-[0_6px_14px_rgba(38,26,21,0.08)] transition-shadow duration-(--dur-component) ease-out group-hover:shadow-[0_10px_18px_rgba(38,26,21,0.12)]"
      >
        <div className="relative">
          <KitchenPhotos images={summary.imageUrls} autoplay={autoplay} delayMs={order * PHOTO_STAGGER_MS} priority={order < 4} />
          {summary.preparationTimeLabel ? (
            <span className={`pointer-events-none absolute left-3 top-3 z-[3] inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-3 text-[0.9375rem] font-semibold text-white ${GLASS}`}>
              <Clock3 className="h-[18px] w-[18px]" aria-hidden="true" />
              {summary.preparationTimeLabel}
            </span>
          ) : null}
          <ChefCircle photoUrl={kitchen.chefPhotoUrl} />
        </div>
        <div className="flex flex-1 flex-col px-3 pb-3 pt-[38px]">
          <h3 className="truncate text-[1.0625rem] font-bold leading-6 tracking-normal text-[#1A1A1A]">{name}</h3>
          <p className="mt-1 line-clamp-2 text-[0.9375rem] leading-[19px] text-[#706864]">
            {kitchen.description || "Home-cooked meals prepared with care."}
          </p>
          <p className="mt-auto pt-2 text-[0.9375rem] font-bold text-[#D92714]">Starts from {summary.startingPriceLabel}</p>
        </div>
      </div>
      <KitchenHeart kitchenId={kitchen.id} name={name} />
    </li>
  );
}

function TopKitchenSkeletons() {
  return (
    <div className={`${ROW} overflow-hidden lg:-mx-4 lg:px-4`} aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className={`${CARD_WIDTH} rounded-[20px] border border-[#E3DDD8] bg-white`}>
          <div className="relative">
            <div className={`${skeletonStyles.block} aspect-[100/63] rounded-t-[19px]`} />
            <span className={`${skeletonStyles.block} absolute -bottom-8 left-3 h-[70px] w-[70px] rounded-full ring-4 ring-white`} />
          </div>
          <div className="px-3 pb-3 pt-[38px]">
            <div className={`${skeletonStyles.block} h-5 w-2/3 rounded-full`} />
            <div className={`${skeletonStyles.block} ${skeletonStyles.soft} mt-2.5 h-3.5 w-full rounded-full`} />
            <div className={`${skeletonStyles.block} ${skeletonStyles.soft} mt-2 h-3.5 w-1/2 rounded-full`} />
            <div className={`${skeletonStyles.block} mt-3 h-4 w-2/5 rounded-full`} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Choose a location, couldn't load, and nothing to show, each with the app's drawing and plain words. */
function KitchenStates({ state, searchTerm, message, onRetry, onManageAddress }: Pick<KitchensGridProps, "state" | "searchTerm" | "message" | "onRetry" | "onManageAddress">) {
  if (state === "address-required") {
    return (
      <EmptyState compact heading="h3" illustration="location" title="Where should we deliver?" message="Choose an address to see the home kitchens cooking near you.">
        <button type="button" onClick={onManageAddress} className="craves-primary-action">
          <MapPin className="h-5 w-5" aria-hidden="true" />
          Choose location
        </button>
      </EmptyState>
    );
  }
  if (state === "error") {
    return (
      <EmptyState compact heading="h3" role="alert" illustration="loadError" title="We couldn't load home chefs near you" message="Check your connection and try again.">
        <button type="button" onClick={onRetry} className="craves-primary-action">
          <RefreshCw className="h-5 w-5" aria-hidden="true" />
          Try again
        </button>
      </EmptyState>
    );
  }
  const search = searchTerm.trim();
  if (search) {
    return <EmptyState compact heading="h3" illustration="search" title={`No kitchens match “${search}”`} message="Try another chef, kitchen name or area." />;
  }
  return (
    <EmptyState
      compact
      heading="h3"
      illustration="comingSoonArea"
      title="No home chefs near you yet"
      message={message || "Home chefs don't cook near this address yet. Try another address."}
    >
      <button type="button" onClick={onManageAddress} className="craves-primary-action">
        <MapPin className="h-5 w-5" aria-hidden="true" />
        Change address
      </button>
      <button type="button" onClick={onRetry} className={emptyStateSecondaryAction}>
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Check again
      </button>
    </EmptyState>
  );
}

/** Home's "Top kitchens near you" (app 1.35): one row of the nearest kitchens cooking something you can order now. */
function TopKitchens({ kitchens, searchTerm, state, message, onSelectKitchen, onRetry, onManageAddress, dishes, limit }: KitchensGridProps) {
  const summaries = useMemo(() => summarizeKitchenDishes(dishes), [dishes]);
  // Only kitchens with a dish in the nearby feed (already narrowed to the food type), nearest first, as in the app.
  const cards = useMemo(
    () =>
      kitchens
        .flatMap((kitchen) => {
          const summary = summaries.get(kitchen.id);
          return summary ? [{ kitchen, summary }] : [];
        })
        .slice(0, limit),
    [kitchens, limit, summaries],
  );
  const [row, setRow] = useState<HTMLUListElement | null>(null);
  const edges = useRowEdges(row);
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
  const slideshow = !reduceMotion && cards.some(({ summary }) => summary.imageUrls.length > 1);

  // Nothing near you to show here: the dishes below say why, so the row steps aside (as in the app).
  if (state === "ready" && cards.length === 0) return null;

  return (
    <section className="mx-auto max-w-[88rem] px-4 pt-4 md:px-7 md:pt-5 lg:px-10 lg:pt-6" aria-labelledby="nearby-kitchens-heading">
      <div className="flex items-center gap-2">
        <h2 id="nearby-kitchens-heading" className={`${HOME_HEADING} min-w-0 flex-1`}>
          Top kitchens near you
        </h2>
        {state === "ready" ? (
          <>
            {edges.left || edges.right ? (
              <div className="hidden items-center gap-2 md:flex">
                <button type="button" onClick={() => scrollRow(row, -1, row?.clientWidth)} disabled={!edges.left} aria-label="Show previous kitchens" className={ARROW_BUTTON}>
                  <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => scrollRow(row, 1, row?.clientWidth)} disabled={!edges.right} aria-label="Show more kitchens" className={ARROW_BUTTON}>
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            ) : null}
            <Link
              to="/chefs"
              className="inline-flex min-h-12 shrink-0 items-center gap-0.5 rounded-full pl-3 pr-2 text-[0.9375rem] font-bold text-[#D92714] transition-colors hover:bg-[#FDEAE8]"
            >
              See all <span className="sr-only">kitchens near you</span>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </>
        ) : null}
      </div>

      {state === "loading" ? (
        <>
          <p className="sr-only" role="status">Loading nearby kitchens</p>
          <TopKitchenSkeletons />
        </>
      ) : state === "ready" ? (
        <>
          <ul
            ref={setRow}
            role="list"
            className={`${ROW} snap-x snap-mandatory scroll-px-4 overflow-x-auto overscroll-x-contain [scrollbar-width:none] md:scroll-px-7 lg:-mx-4 lg:px-4 lg:scroll-px-4 [&::-webkit-scrollbar]:hidden`}
          >
            {cards.map(({ kitchen, summary }, index) => (
              <TopKitchenCard
                key={kitchen.id}
                kitchen={kitchen}
                summary={summary}
                order={index}
                autoplay={slideshow && !photosPaused}
                onOpen={() => onSelectKitchen(kitchen)}
              />
            ))}
          </ul>
          {/* Under the row, like the banner's: the header stays one line on phones. */}
          {slideshow ? (
            <div className="-mt-4 flex justify-end">
              <button
                type="button"
                onClick={togglePhotos}
                className="inline-flex min-h-12 items-center gap-1.5 rounded-full px-3 text-[0.8125rem] font-semibold !border-0 !bg-transparent !text-[#6B6B6B] !shadow-none hover:!bg-[#F1F3F5]"
              >
                {photosPaused ? <Play className="h-3.5 w-3.5" aria-hidden="true" /> : <Pause className="h-3.5 w-3.5" aria-hidden="true" />}
                {photosPaused ? "Play kitchen photos" : "Pause kitchen photos"}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <KitchenStates state={state} searchTerm={searchTerm} message={message} onRetry={onRetry} onManageAddress={onManageAddress} />
      )}
    </section>
  );
}

/** The chefs page: every nearby chef in a grid of the cards it draws. */
function ChefsGrid({ kitchens, searchTerm, state, message, onSelectKitchen, onRetry, onManageAddress, dishes, renderKitchen, totalNearby }: KitchensGridProps & Required<Pick<KitchensGridProps, "renderKitchen">>) {
  const summaries = useMemo(() => summarizeKitchenDishes(dishes), [dishes]);
  return (
    <section
      className="mx-auto max-w-[88rem] px-4 pb-3 pt-3 md:px-7 md:pb-4 md:pt-4 lg:px-10 lg:pb-5 lg:pt-5"
      aria-labelledby="nearby-kitchens-heading"
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          {/* The app's words (1.31): "Nearby kitchens" and how many cook within 10 km. */}
          <h2
            id="nearby-kitchens-heading"
            className="mt-1.5 font-display text-2xl font-black tracking-[-0.035em] text-[#1A1A1A] lg:text-[1.75rem]"
          >
            Nearby kitchens
          </h2>
        </div>
        {state === "ready" ? (
          <span className="rounded-full bg-[#F6F7F8] px-3.5 py-2 text-sm font-semibold text-[#6B6B6B]">
            {searchTerm.trim()
              ? `${kitchens.length} ${kitchens.length === 1 ? "match" : "matches"}`
              : `${Math.max(totalNearby ?? 0, kitchens.length)} within 10 km`}
          </span>
        ) : null}
      </div>

      {state === "loading" ? (
        <div>
          <p className="sr-only" role="status">Loading nearby kitchens</p>
          <div className={styles.kitchenGrid}>
            {Array.from({ length: 6 }, (_, index) => (
              <KitchenDiscoverCardSkeleton key={index} />
            ))}
          </div>
        </div>
      ) : state === "ready" && kitchens.length > 0 ? (
        <div className={styles.kitchenGrid}>
          {kitchens.map((kitchen) => (
            <Fragment key={kitchen.id}>{renderKitchen(kitchen, summaries.get(kitchen.id), () => onSelectKitchen(kitchen))}</Fragment>
          ))}
        </div>
      ) : (
        <KitchenStates state={state} searchTerm={searchTerm} message={message} onRetry={onRetry} onManageAddress={onManageAddress} />
      )}
    </section>
  );
}

export function KitchensGrid(props: KitchensGridProps) {
  return props.renderKitchen ? <ChefsGrid {...props} renderKitchen={props.renderKitchen} /> : <TopKitchens {...props} />;
}

export default KitchensGrid;

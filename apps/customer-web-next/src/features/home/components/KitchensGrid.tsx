import { Fragment, useMemo, useState, type ReactNode, type UIEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ChefHat, ChevronLeft, ChevronRight, Clock3, MapPin, RefreshCw } from "lucide-react";

import { formatDistance, type NearbyKitchen } from "@/features/home/lib/discovery-contract";
import { scrollRow, useRowEdges } from "@/features/home/lib/row-scroll";
import styles from "@/features/home/screens/HomeReference.module.css";
import skeletonStyles from "@/shared/components/loading/CustomerPageSkeleton.module.css";
import { safeChefPhotoUrl } from "@/shared/lib/chef-photo";
import { summarizeKitchenDishes, type KitchenCardDish, type KitchenDishSummary } from "@/shared/lib/kitchen-dish-summary";
import { FavoriteKitchenHeart } from "@/shared/ui/buttons/FavoriteKitchenHeart";
import { EmptyState, emptyStateSecondaryAction } from "@/shared/ui/feedback/EmptyState";

type DiscoveryState = "loading" | "ready" | "error" | "address-required";

const DOTS = 5;
/**
 * The kitchen photo's shape (owner, 5 Nov 2026: photos were too big for the words). 16:9, the
 * landscape crop DoorDash and Wolt use, leaves the photo about 62% of the card, near the golden
 * ratio; the Kitchens page keeps 2:1 while its cards are wider (one or two columns, up to lg) so
 * the same balance holds there (measured 62-66% photo at 390, 768 and 1440 px).
 */
const PHOTO = "aspect-[16/9]";
const WIDE_PHOTO = "aspect-[2/1] lg:aspect-[16/9]";
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
  /** Home shows the nearest few in one row and links to every kitchen; the Kitchens page shows all. */
  limit?: number;
  /** The Kitchens page draws its cards (KitchenCard) in a grid; Home's row of cards is the default. Each must be an <li>. */
  renderKitchen?: (kitchen: NearbyKitchen, summary: KitchenDishSummary | undefined, open: () => void) => ReactNode;
  /** How many kitchens cook within 10 km in all (more pages may still be to load): Home's "See all 24 kitchens". */
  totalNearby?: number;
}

/**
 * The cook's dishes first, then the kitchen's own photos, side by side: people swipe through them (owner,
 * 5 Nov 2026). Nothing moves on its own, so there is no pause button.
 */
function KitchenPhotos({ images, priority, aspect }: { images: readonly string[]; priority: boolean; aspect: string }) {
  // A photo that fails to load leaves the strip instead of showing a broken image.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const photos = useMemo(() => images.filter((src) => !failed.has(src)), [images, failed]);
  const count = photos.length;
  const [index, setIndex] = useState(0);
  const current = Math.min(index, Math.max(count - 1, 0));

  if (!count) {
    return (
      <div className={`flex ${aspect} items-center justify-center bg-[#F7F5F3] text-[#D92714]`}>
        <ChefHat className="h-[34px] w-[34px]" strokeWidth={1.75} aria-hidden="true" />
      </div>
    );
  }

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const width = event.currentTarget.clientWidth;
    if (width) setIndex(Math.min(count - 1, Math.round(event.currentTarget.scrollLeft / width)));
  };
  const firstDot = Math.max(0, Math.min(current - 2, count - DOTS));
  return (
    <div className={`relative ${aspect} overflow-hidden bg-[#F7F5F3]`}>
      <div
        onScroll={onScroll}
        className="flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {photos.map((src, position) => (
          <img
            key={src}
            src={src}
            alt=""
            loading={position === 0 && priority ? "eager" : "lazy"}
            fetchPriority={position === 0 && priority ? "high" : "auto"}
            decoding="async"
            draggable={false}
            onError={() => setFailed((value) => new Set(value).add(src))}
            className="h-full w-full shrink-0 snap-center snap-always object-cover transition-[scale] duration-500 ease-out motion-safe:group-hover:scale-[1.03]"
          />
        ))}
      </div>
      {count > 1 ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 flex h-10 items-end justify-center gap-1.5 bg-gradient-to-t from-[#1A1A1A]/45 to-transparent pb-2.5">
          {photos.slice(firstDot, firstDot + DOTS).map((src, offset) => (
            <span
              key={src}
              className={`h-1.5 rounded-full bg-white transition-[width,opacity] duration-(--dur-component) motion-reduce:transition-none ${firstDot + offset === current ? "w-4" : "w-1.5 opacity-60"}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** The cook's picture in a small circle; without one, a chef hat (never initials). */
function ChefCircle({ photoUrl }: { photoUrl: string | null }) {
  const url = safeChefPhotoUrl(photoUrl);
  // Remember which url failed, so a new url gets its own try.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F7F5F3] ring-2 ring-white shadow-[0_2px_8px_rgba(38,26,21,0.14)]">
      {url && url !== failedUrl ? (
        <img src={url} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailedUrl(url)} className="h-full w-full object-cover" />
      ) : (
        <ChefHat className="h-5 w-5 text-[#1A1A1A]" strokeWidth={1.75} />
      )}
    </span>
  );
}

/** "Lakshmi" from "Lakshmi Devi": the cook's first name for "Cooked by …". */
export function cookFirstName(kitchen: Pick<NearbyKitchen, "displayName">): string | null {
  return kitchen.displayName?.trim().split(/\s+/)[0] || null;
}

/**
 * One kitchen card for Home and the Kitchens page (owner, 5 Nov 2026): the cook's food large, then
 * one line with the cook's face, the kitchen, "Cooked by …", how far, and the starting price.
 */
export function KitchenCard({
  kitchen,
  summary,
  order = 0,
  onOpen,
  wide = false,
  className = "",
}: {
  kitchen: NearbyKitchen;
  summary: KitchenDishSummary | undefined;
  order?: number;
  onOpen: () => void;
  /** A full-width card (the Kitchens page on phones): a shorter photo, so more kitchens fit on screen. */
  wide?: boolean;
  className?: string;
}) {
  const name = kitchen.kitchenName;
  const cook = cookFirstName(kitchen);
  const images = useMemo(
    () => [...new Set([...(summary?.imageUrls ?? []), ...kitchen.kitchenPhotoUrls])],
    [kitchen.kitchenPhotoUrls, summary?.imageUrls],
  );
  const details = [cook ? `Cooked by ${cook}` : null, kitchen.areaName, formatDistance(kitchen.distanceMeters)].filter(Boolean).join(" · ");
  return (
    // The heart is the card button's sibling, so neither control sits inside the other.
    <li className={`group relative list-none transition-[translate] duration-(--dur-component) ease-out motion-safe:hover:-translate-y-0.5 ${className}`}>
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
        className="flex h-full cursor-pointer flex-col overflow-hidden rounded-[18px] bg-white text-left ring-1 ring-[#EEE9E4] shadow-[0_1px_2px_rgba(38,26,21,0.06),0_6px_18px_rgba(38,26,21,0.07)] transition-shadow duration-(--dur-component) ease-out group-hover:shadow-[0_12px_26px_rgba(38,26,21,0.12)]"
      >
        <div className="relative">
          <KitchenPhotos images={images} priority={order < 4} aspect={wide ? WIDE_PHOTO : PHOTO} />
        </div>
        {/* Short lines under the photo: the kitchen; who cooks, where and how far; how soon and from how much. */}
        <div className="flex flex-1 gap-2.5 px-3 pb-3 pt-2.5">
          <ChefCircle photoUrl={kitchen.chefPhotoUrl} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-bold leading-6 text-[#1A1A1A]">{name}</h3>
            <p className="truncate text-[0.8125rem] leading-5 text-[#706864]">{details}</p>
            {summary ? (
              <p className="mt-1.5 flex items-center gap-2 whitespace-nowrap text-[0.8125rem] font-semibold leading-5 text-[#261A15]">
                {summary.preparationTimeLabel ? (
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="h-3.5 w-3.5 text-[#706864]" aria-hidden="true" />
                    {summary.preparationTimeLabel}
                  </span>
                ) : null}
                <span className="ml-auto font-normal text-[#706864]">
                  From <span className="font-bold text-[#C92716]">{summary.startingPriceLabel}</span>
                </span>
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <FavoriteKitchenHeart kitchenId={kitchen.id} kitchenName={name} onPhoto size="sm" className="absolute right-2 top-2 z-[4]" />
    </li>
  );
}

function KitchenCardSkeleton({ className = "", wide = false }: { className?: string; wide?: boolean }) {
  return (
    <div className={`overflow-hidden rounded-[18px] bg-white ring-1 ring-[#EEE9E4] ${className}`}>
      <div className={`${skeletonStyles.block} ${wide ? WIDE_PHOTO : PHOTO}`} />
      <div className="flex gap-2.5 px-3 pb-3 pt-2.5">
        <span className={`${skeletonStyles.block} h-10 w-10 shrink-0 rounded-full`} />
        <div className="min-w-0 flex-1">
          <div className={`${skeletonStyles.block} h-4 w-2/3 rounded-full`} />
          <div className={`${skeletonStyles.block} ${skeletonStyles.soft} mt-2 h-3 w-1/2 rounded-full`} />
          <div className={`${skeletonStyles.block} ${skeletonStyles.soft} mt-2.5 h-3 w-3/4 rounded-full`} />
        </div>
      </div>
    </div>
  );
}

function TopKitchenSkeletons() {
  return (
    <div className={`${ROW} overflow-hidden lg:-mx-4 lg:px-4`} aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <KitchenCardSkeleton key={index} className={CARD_WIDTH} />
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
      <EmptyState compact heading="h3" role="alert" illustration="loadError" title="We couldn't load kitchens near you" message="Check your connection and try again.">
        <button type="button" onClick={onRetry} className="craves-primary-action">
          <RefreshCw className="h-5 w-5" aria-hidden="true" />
          Try again
        </button>
      </EmptyState>
    );
  }
  const search = searchTerm.trim();
  if (search) {
    return <EmptyState compact heading="h3" illustration="search" title={`No kitchens match “${search}”`} message="Try another kitchen, cook or area." />;
  }
  return (
    <EmptyState
      compact
      heading="h3"
      illustration="comingSoonArea"
      title="No home kitchens near you yet"
      message={message || "No home kitchens cook near this address yet. Try another address."}
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
function TopKitchens({ kitchens, searchTerm, state, message, onSelectKitchen, onRetry, onManageAddress, dishes, limit, totalNearby }: KitchensGridProps) {
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
              {/* Phones keep the heading on one line: "See all 8", still read as "See all 8 kitchens". */}
              <span>
                See all{totalNearby ? ` ${totalNearby}` : ""}{" "}
                <span className={totalNearby ? "max-sm:sr-only" : undefined}>kitchens</span>
              </span>
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
              <KitchenCard
                key={kitchen.id}
                kitchen={kitchen}
                summary={summary}
                order={index}
                className={CARD_WIDTH}
                onOpen={() => onSelectKitchen(kitchen)}
              />
            ))}
          </ul>
        </>
      ) : (
        <KitchenStates state={state} searchTerm={searchTerm} message={message} onRetry={onRetry} onManageAddress={onManageAddress} />
      )}
    </section>
  );
}

/** The Kitchens page: every nearby kitchen in a grid of the cards it draws. */
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
              <KitchenCardSkeleton key={index} wide />
            ))}
          </div>
        </div>
      ) : state === "ready" && kitchens.length > 0 ? (
        <ul role="list" className={styles.kitchenGrid}>
          {kitchens.map((kitchen) => (
            <Fragment key={kitchen.id}>{renderKitchen(kitchen, summaries.get(kitchen.id), () => onSelectKitchen(kitchen))}</Fragment>
          ))}
        </ul>
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

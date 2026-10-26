import { Link } from "@tanstack/react-router";
import { motion, useIsPresent } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, Search } from "lucide-react";

import { searchNearby } from "@/features/home/api/discovery-search";
import type { NearbyKitchen } from "@/features/home/lib/discovery-contract";
import { FOOD_LABELS, matchesFoodPreference } from "@/features/home/lib/dish-filters";
import type { HomeFoodPreference } from "@/features/home/lib/home-return-state";
import {
  distanceAway,
  matchesDishSearch,
  matchesKitchenSearch,
  mergeById,
  toSearchDish,
  type SearchDish,
} from "@/features/home/lib/home-search";
import styles from "@/features/home/screens/HomeReference.module.css";
import { ProgressiveImage } from "@/shared/components/media/ProgressiveImage";
import { ease } from "@/shared/lib/motion";
import { ChefFace } from "@/shared/ui/data-display/ChefFace";
import { EmptyState, emptyStateSecondaryAction } from "@/shared/ui/feedback/EmptyState";
import { useOverlayHistory } from "@/shared/ui/overlays/overlay";

/** Words this long are also searched in the catalog, a moment after typing stops (as in the app). */
const SERVER_SEARCH_MIN_CHARS = 2;
const SERVER_SEARCH_DELAY_MS = 300;
const MAX_RESULTS = 20;

interface HomeSearchOverlayProps {
  /** Home's loaded dishes, already narrowed to the food type. */
  dishes: SearchDish[];
  kitchens: NearbyKitchen[];
  searchTerm: string;
  foodPreference: HomeFoodPreference;
  /** The delivery spot: the catalog search looks 10 km around it. */
  latitude: number | null;
  longitude: number | null;
  onSearchTermChange: (value: string) => void;
  onShowAllFood: () => void;
  onClose: () => void;
}

function priceLabel(price: number, currency = "INR"): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(price);
  } catch {
    return `${currency} ${price.toFixed(2)}`;
  }
}

export function HomeSearchOverlay({
  dishes,
  kitchens,
  searchTerm,
  foodPreference,
  latitude,
  longitude,
  onSearchTermChange,
  onShowAllFood,
  onClose,
}: HomeSearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const words = searchTerm.trim();
  const dietLabel = foodPreference === "all" ? null : FOOD_LABELS[foodPreference].toLowerCase();
  // Phone Back closes search instead of leaving Craves; the entry goes as the fade starts.
  const present = useIsPresent();
  useOverlayHistory(present, onClose);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Loaded dishes match with every letter; the catalog also finds the ones past the loaded pages.
  const serverWords =
    latitude !== null && longitude !== null && Array.from(words).length >= SERVER_SEARCH_MIN_CHARS ? words : "";
  const [found, setFound] = useState<{ words: string; dishes: SearchDish[]; kitchens: NearbyKitchen[] } | null>(null);
  useEffect(() => {
    if (!serverWords || latitude === null || longitude === null) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void searchNearby(latitude, longitude, serverWords, controller.signal).then((result) => {
        if (controller.signal.aborted) return;
        setFound({ words: serverWords, dishes: result.dishes.map(toSearchDish), kitchens: result.kitchens });
      });
    }, SERVER_SEARCH_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [latitude, longitude, serverWords]);
  const searching = serverWords !== "" && found?.words !== serverWords;

  const dishResults = useMemo(() => {
    if (!words) return [];
    const more = (found?.dishes ?? []).filter((dish) => matchesFoodPreference(dish, foodPreference));
    return mergeById(dishes, more).filter((dish) => matchesDishSearch(dish, words)).slice(0, MAX_RESULTS);
  }, [dishes, foodPreference, found, words]);

  const kitchenResults = useMemo(
    () =>
      words
        ? mergeById(kitchens, found?.kitchens ?? []).filter((kitchen) => matchesKitchenSearch(kitchen, words)).slice(0, MAX_RESULTS)
        : [],
    [found, kitchens, words],
  );

  const hasResults = dishResults.length > 0 || kitchenResults.length > 0;
  const announcement = !words || (searching && !hasResults)
    ? ""
    : `${dishResults.length} ${dishResults.length === 1 ? "dish" : "dishes"} and ${kitchenResults.length} ${kitchenResults.length === 1 ? "kitchen" : "kitchens"} found`;

  return (
    <motion.div
      className="fixed inset-0 z-[70] origin-top overflow-y-auto overscroll-contain bg-white text-[#1A1A1A]"
      role="dialog"
      aria-modal="true"
      aria-label="Search Craves"
      initial={{ opacity: 0, scale: 0.997 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.17, ease: ease.out } }}
      exit={{ opacity: 0, transition: { duration: 0.15, ease: ease.in } }}
    >
      <div className="sticky top-0 z-10 border-b border-[#E5E7EB] bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4 md:px-7">
          <button
            type="button"
            onClick={onClose}
            className="!flex !h-11 !w-11 !shrink-0 !items-center !justify-center !rounded-full !bg-[#F1F3F5] !p-0 !text-[#1A1A1A] hover:!text-[#F62E18]"
            aria-label="Close search"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>

          <label className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-[1.35rem] bg-[#F1F3F5] px-5 transition-[box-shadow] duration-200 hover:ring-2 hover:ring-[#1A1A1A]/15 hover:shadow-[0_10px_30px_rgba(26,26,26,0.14)] focus-within:ring-2 focus-within:ring-[#F62E18] focus-within:shadow-[0_12px_34px_rgba(26,26,26,0.14)]">
            <Search className="h-5 w-5 shrink-0 text-[#F62E18]" aria-hidden="true" />
            <input
              ref={inputRef}
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
              placeholder="Search dishes or kitchens"
              className={`${styles.searchInput} w-full p-0 text-sm font-semibold text-[#1A1A1A] placeholder:text-[#6B6B6B]`}
              style={{ border: 0, outline: "none", boxShadow: "none", background: "transparent" }}
              type="text"
              inputMode="search"
              autoComplete="off"
              aria-label="Search dishes and kitchens"
            />
          </label>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-6 md:px-7 md:pt-8">
        <p className="sr-only" aria-live="polite">{announcement}</p>

        {!words ? (
          <div className="mx-auto max-w-md py-12 text-center md:py-16">
            <h2 className="font-display text-xl font-bold tracking-[-0.02em] text-[#1A1A1A] md:text-2xl">Search nearby food</h2>
            <p className="mt-2 text-[0.9375rem] leading-6 text-[#6B6B6B]">
              Start typing. Matching dishes and kitchens update with every character.
            </p>
          </div>
        ) : !hasResults && searching ? (
          <p role="status" className="flex items-center justify-center gap-3 py-16 text-sm font-semibold text-[#6B6B6B]">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#E5E7EB] border-t-[#F62E18] motion-reduce:animate-none" aria-hidden="true" />
            Searching nearby dishes and kitchens…
          </p>
        ) : !hasResults ? (
          <EmptyState
            illustration="search"
            title={`No results for “${words}”`}
            message={
              dietLabel
                ? `Only ${dietLabel} dishes are shown. Show all food, or try another dish or kitchen name.`
                : "Try another dish or kitchen name, or check the spelling."
            }
          >
            {dietLabel ? (
              <button type="button" onClick={onShowAllFood} className={emptyStateSecondaryAction}>
                Show all food
              </button>
            ) : null}
          </EmptyState>
        ) : (
          <>
            {dishResults.length > 0 ? (
              <section aria-labelledby="search-dishes-heading">
                <h2 id="search-dishes-heading" className="mb-2 text-lg font-bold text-[#1A1A1A]">Dishes</h2>
                <div className="divide-y divide-[#E5E7EB] border-y border-[#E5E7EB]">
                  {dishResults.map((dish, index) => (
                    <Link
                      key={dish.id}
                      to="/dish/$id"
                      params={{ id: dish.id }}
                      className="group flex items-center gap-4 py-3.5"
                    >
                      <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-2xl bg-[#F1F3F5]">
                        <ProgressiveImage
                          src={dish.img}
                          alt=""
                          width={80}
                          height={64}
                          loading={index < 3 ? "eager" : "lazy"}
                          fetchPriority={index === 0 ? "high" : "auto"}
                          fallbackLabel="Dish photo unavailable"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-bold text-[#1A1A1A] group-hover:text-[#D92714]">{dish.name}</p>
                        <p className="mt-1 truncate text-xs font-semibold text-[#6B6B6B]">
                          From {dish.chef}
                          {typeof dish.distanceMeters === "number" ? ` · ${distanceAway(dish.distanceMeters)}` : ""}
                        </p>
                        <p className="mt-1 text-sm font-bold text-[#1A1A1A]">{priceLabel(dish.price, dish.currency)}</p>
                      </div>
                      <ChevronRight className="h-5 w-5 shrink-0 text-[#6B6B6B]" aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              </section>
            ) : dietLabel ? (
              // Kitchens matched, but none of their dishes is of the chosen food type.
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#F1F3F5] p-4">
                <p className="text-sm font-semibold text-[#1A1A1A]">No {dietLabel} dishes match “{words}”.</p>
                <button type="button" onClick={onShowAllFood} className={emptyStateSecondaryAction}>
                  Show all food
                </button>
              </div>
            ) : null}

            {kitchenResults.length > 0 ? (
              <section className="mt-8" aria-labelledby="search-kitchens-heading">
                <h2 id="search-kitchens-heading" className="mb-2 text-lg font-bold text-[#1A1A1A]">Kitchens</h2>
                <div className="divide-y divide-[#E5E7EB] border-y border-[#E5E7EB]">
                  {kitchenResults.map((kitchen) => (
                    <Link
                      key={kitchen.id}
                      to="/kitchen/$id"
                      params={{ id: kitchen.id }}
                      className="group flex items-center gap-4 py-3.5"
                    >
                      <ChefFace photoUrl={kitchen.chefPhotoUrl} name={kitchen.displayName ?? kitchen.kitchenName} size={56} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-bold text-[#1A1A1A] group-hover:text-[#D92714]">{kitchen.kitchenName}</p>
                        <p className="mt-1 truncate text-xs font-semibold text-[#6B6B6B]">Kitchen · {distanceAway(kitchen.distanceMeters)}</p>
                      </div>
                      <ChevronRight className="h-5 w-5 shrink-0 text-[#6B6B6B]" aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </main>
    </motion.div>
  );
}

export default HomeSearchOverlay;

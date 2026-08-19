import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import {
  ArrowLeft,
  ChefHat,
  MapPin,
  Search,
  SearchX,
  UtensilsCrossed,
} from "lucide-react";

import type { NearbyKitchen } from "@/lib/discovery-contract";
import type { Dish } from "@/services/api/dishes";

interface HomeSearchOverlayProps {
  dishes: Dish[];
  kitchens: NearbyKitchen[];
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
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
  onSearchTermChange,
  onClose,
}: HomeSearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const normalized = searchTerm.trim().toLocaleLowerCase("en-IN");

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

  const dishResults = useMemo(() => {
    const source = normalized
      ? dishes.filter((dish) => {
          const searchable = `${dish.name} ${dish.chef} ${dish.category} ${dish.desc}`.toLocaleLowerCase("en-IN");
          return searchable.includes(normalized);
        })
      : dishes;
    return source.slice(0, 10);
  }, [dishes, normalized]);

  const kitchenResults = useMemo(() => {
    const source = normalized
      ? kitchens.filter((kitchen) =>
          [
            kitchen.kitchenName,
            kitchen.description,
            kitchen.areaName,
            kitchen.city,
            kitchen.state,
          ].some((value) => value?.toLocaleLowerCase("en-IN").includes(normalized)),
        )
      : kitchens;
    return source.slice(0, 8);
  }, [kitchens, normalized]);

  const hasResults = dishResults.length > 0 || kitchenResults.length > 0;

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-white text-[#1A1A1A]" role="dialog" aria-modal="true" aria-label="Search Craves">
      <div className="sticky top-0 z-10 border-b border-[#E5E7EB] bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4 md:px-7">
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#1A1A1A] transition hover:scale-[1.03]"
            aria-label="Close search"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>

          <label className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-[1.35rem] bg-[#F1F3F5] px-5 focus-within:ring-2 focus-within:ring-[#F62E18]">
            <Search className="h-5 w-5 shrink-0 text-[#F62E18]" aria-hidden="true" />
            <span className="sr-only">Search dishes or home chefs</span>
            <input
              ref={inputRef}
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
              placeholder="Search dishes or home chefs"
              className="w-full border-0 bg-transparent p-0 text-sm font-semibold text-[#1A1A1A] outline-none placeholder:text-[#6B6B6B] focus:ring-0"
              type="search"
              autoComplete="off"
              aria-label="Search dishes or home chefs"
            />
          </label>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-7 md:px-7 md:pt-9">
        <div className="mb-7">
          <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-[#F62E18]">
            {normalized ? "Search results" : "Explore nearby"}
          </p>
          <h2 className="mt-1.5 font-display text-3xl font-black tracking-[-0.04em] text-[#1A1A1A]">
            {normalized ? `Results for “${searchTerm.trim()}”` : "What would you like to eat?"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">
            Search across live dishes and nearby Craves home chefs.
          </p>
        </div>

        {!hasResults ? (
          <div className="rounded-[1.75rem] border border-dashed border-[#E5E7EB] bg-[#F1F3F5] p-10 text-center">
            <SearchX className="mx-auto h-9 w-9 text-[#6B6B6B]" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-black text-[#1A1A1A]">No matching dishes or chefs</h3>
            <p className="mt-2 text-sm text-[#6B6B6B]">Try a dish name, cuisine, category or home-chef name.</p>
          </div>
        ) : null}

        {dishResults.length > 0 ? (
          <section aria-labelledby="search-dishes-heading">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h3 id="search-dishes-heading" className="text-lg font-black text-[#1A1A1A]">Dishes</h3>
              <span className="text-xs font-bold text-[#6B6B6B]">{dishResults.length} shown</span>
            </div>
            <div className="divide-y divide-[#E5E7EB] border-y border-[#E5E7EB]">
              {dishResults.map((dish) => (
                <Link
                  key={dish.id}
                  to="/dish/$id"
                  params={{ id: dish.id }}
                  className="group flex items-center gap-4 py-4 focus-visible:outline-none"
                >
                  <div className="h-20 w-24 shrink-0 overflow-hidden rounded-2xl bg-[#F1F3F5]">
                    <img src={dish.img} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-black text-[#1A1A1A] group-hover:text-[#F62E18]">{dish.name}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-[#6B6B6B]">{dish.chef} · {dish.category}</p>
                    <p className="mt-2 text-sm font-black text-[#1A1A1A]">{priceLabel(dish.price, dish.currency)}</p>
                  </div>
                  <UtensilsCrossed className="h-5 w-5 shrink-0 text-[#F62E18]" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {kitchenResults.length > 0 ? (
          <section className="mt-10" aria-labelledby="search-chefs-heading">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h3 id="search-chefs-heading" className="text-lg font-black text-[#1A1A1A]">Home chefs</h3>
              <span className="text-xs font-bold text-[#6B6B6B]">{kitchenResults.length} shown</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {kitchenResults.map((kitchen) => {
                const location = [kitchen.areaName, kitchen.city].filter(Boolean).join(", ");
                return (
                  <Link
                    key={kitchen.id}
                    to="/chef/$id"
                    params={{ id: kitchen.id }}
                    className="group flex items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-4 transition hover:border-[#F62E18] hover:shadow-[0_8px_24px_rgba(26,26,26,0.07)]"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
                      <ChefHat className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black text-[#1A1A1A] group-hover:text-[#F62E18]">{kitchen.kitchenName}</span>
                      <span className="mt-1 flex items-center gap-1 truncate text-xs font-semibold text-[#6B6B6B]">
                        <MapPin className="h-3.5 w-3.5 shrink-0 fill-[#F62E18] text-[#F62E18]" strokeWidth={1.4} aria-hidden="true" />
                        {location || `${kitchen.city}, ${kitchen.state}`}
                      </span>
                      <span className="mt-1 block text-[0.7rem] font-bold text-[#6B6B6B]">
                        {kitchen.activeMenuItemCount} active {kitchen.activeMenuItemCount === 1 ? "dish" : "dishes"}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default HomeSearchOverlay;

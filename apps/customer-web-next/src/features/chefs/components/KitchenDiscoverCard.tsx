import { useState } from "react";

import { formatDistance, type NearbyKitchen } from "@/features/home/lib/discovery-contract";
import type { KitchenDishSummary } from "@/shared/lib/kitchen-dish-summary";
import { FavoriteKitchenHeart } from "@/shared/ui/buttons/FavoriteKitchenHeart";
import { ChefFace } from "@/shared/ui/data-display/ChefFace";

/** A Chefs-tab card: chef face, name and area, then 1 large and 2 small photos (the kitchen's own first, then its dishes') with "+N". */
export function KitchenDiscoverCard({ kitchen, summary, onOpen }: { kitchen: NearbyKitchen; summary: KitchenDishSummary | undefined; onOpen: () => void }) {
  const name = kitchen.displayName || kitchen.kitchenName;
  // A photo that fails to load leaves the strip instead of showing a broken image.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const photos = [...new Set([...kitchen.kitchenPhotoUrls, ...(summary?.imageUrls ?? [])])].filter((url) => !failed.has(url));
  const [first, second, third] = photos;
  const dishCount = `${kitchen.activeMenuItemCount} ${kitchen.activeMenuItemCount === 1 ? "dish" : "dishes"}`;
  const photo = (src: string) => (
    <img src={src} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed((current) => new Set(current).add(src))} className="block h-full w-full bg-[#F1F3F5] object-cover" />
  );

  return (
    <article className="relative rounded-[1.35rem] border border-[#E5E7EB] bg-white text-[#1A1A1A] shadow-[0_7px_22px_rgba(26,26,26,0.065)] transition-[border-color,box-shadow] duration-300 hover:border-[#D7DADF] hover:shadow-[0_14px_32px_rgba(26,26,26,0.10)]">
      {/* The heart is the card button's sibling, so neither control sits inside the other. */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`View ${name} kitchen`}
        className="block w-full rounded-[1.35rem] !border-0 !bg-transparent p-3 text-left !shadow-none sm:p-3.5"
      >
        <span className="flex items-center gap-3 pr-11">
          <ChefFace photoUrl={kitchen.chefPhotoUrl} name={name} size={56} />
          <span className="min-w-0">
            <span className="block truncate font-display text-base font-black tracking-[-0.02em]">{name}</span>
            <span className="mt-0.5 block truncate text-xs font-semibold text-[#6B6B6B]">
              {[kitchen.areaName || kitchen.city, `${formatDistance(kitchen.distanceMeters)} away`].join(" · ")}
            </span>
          </span>
        </span>

        {first ? (
          <span aria-hidden="true" className="mt-3 flex h-[9.5rem] gap-1 overflow-hidden rounded-2xl">
            <span className="min-w-0 flex-[2]">{photo(first)}</span>
            {second ? (
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="min-h-0 flex-1">{photo(second)}</span>
                {third ? (
                  <span className="relative min-h-0 flex-1">
                    {photo(third)}
                    {photos.length > 3 ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-[#1A1A1A]/45 font-display text-lg font-black text-white">+{photos.length - 3}</span>
                    ) : null}
                  </span>
                ) : null}
              </span>
            ) : null}
          </span>
        ) : kitchen.description ? (
          <span className="mt-3 line-clamp-2 block text-sm leading-6 text-[#1A1A1A]">{kitchen.description}</span>
        ) : null}

        <span className="mt-3 flex items-center justify-between gap-3 text-xs">
          <span className="min-w-0 truncate font-semibold text-[#6B6B6B]">{[summary?.preparationTimeLabel, dishCount].filter(Boolean).join(" · ")}</span>
          {summary ? <span className="shrink-0 font-black text-[#C4200F]">From {summary.startingPriceLabel}</span> : null}
        </span>
      </button>
      <FavoriteKitchenHeart kitchenId={kitchen.id} kitchenName={name} className="absolute right-3 top-4 !h-10 !w-10" />
    </article>
  );
}

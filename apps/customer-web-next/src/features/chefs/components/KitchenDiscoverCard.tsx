import { useState } from "react";
import { Heart } from "lucide-react";

import { formatDistance, type NearbyKitchen } from "@/features/home/lib/discovery-contract";
import { useFavoriteKitchen } from "@/shared/hooks/use-favorite-kitchen";
import type { KitchenDishSummary } from "@/shared/lib/kitchen-dish-summary";
import { ChefFace } from "@/shared/ui/data-display/ChefFace";

/** The app's (1.35) 48 px heart on the warm grey tile, beside the card's own button. */
function KitchenHeart({ kitchenId, name }: { kitchenId: string; name: string }) {
  const { saved, busy, toggle } = useFavoriteKitchen(kitchenId);
  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from saved` : `Save ${name}`}
      className="absolute right-3 top-4 flex h-12 !min-h-12 w-12 !min-w-12 items-center justify-center rounded-full !border-0 !bg-[#F7F5F3] !p-0 !shadow-none transition-[background-color,scale] duration-(--dur-micro) hover:!bg-[#FDEAE8] motion-safe:active:scale-[0.94] disabled:cursor-wait disabled:!opacity-100"
    >
      <Heart className={`h-6 w-6 ${saved ? "fill-[#F62E18] text-[#F62E18]" : "text-[#261A15]"}`} aria-hidden="true" />
    </button>
  );
}

/**
 * A Chefs-tab card as in the app (1.35): the chef's picture (else the kitchen's initials), the
 * kitchen name, area and distance, then 1 large and 2 small photos (the kitchen's own first, then
 * its dishes') with "+N".
 */
export function KitchenDiscoverCard({ kitchen, summary, onOpen }: { kitchen: NearbyKitchen; summary: KitchenDishSummary | undefined; onOpen: () => void }) {
  // The kitchen's name leads everywhere on the Chefs tab, as in the app.
  const name = kitchen.kitchenName;
  // A photo that fails to load leaves the strip instead of showing a broken image.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const photos = [...new Set([...kitchen.kitchenPhotoUrls, ...(summary?.imageUrls ?? [])])].filter((url) => !failed.has(url));
  const [first, second, third] = photos;
  const dishCount = `${kitchen.activeMenuItemCount} ${kitchen.activeMenuItemCount === 1 ? "dish" : "dishes"}`;
  const photo = (src: string) => (
    <img src={src} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed((current) => new Set(current).add(src))} className="block h-full w-full bg-[#F7F5F3] object-cover" />
  );

  return (
    <article className="relative rounded-[20px] border border-[#E5E7EB] bg-white text-[#261A15] shadow-[0_6px_14px_rgba(38,26,21,0.08)] transition-[border-color,box-shadow] duration-300 hover:border-[#D5CEC8] hover:shadow-[0_14px_32px_rgba(38,26,21,0.12)]">
      {/* The heart is the card button's sibling, so neither control sits inside the other. */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`View ${name} kitchen`}
        className="block w-full rounded-[20px] !border-0 !bg-transparent p-3 text-left !shadow-none"
      >
        <span className="flex items-center gap-3 pr-12">
          <ChefFace photoUrl={kitchen.chefPhotoUrl} name={name} size={56} className="bg-[#FFF5E9] font-extrabold text-[#D92714]" />
          <span className="min-w-0">
            <span className="block truncate font-display text-[1.0625rem] font-bold leading-6">{name}</span>
            <span className="block truncate text-[0.9375rem] text-[#706864]">
              {[kitchen.areaName || kitchen.city, `${formatDistance(kitchen.distanceMeters)} away`].join(" · ")}
            </span>
          </span>
        </span>

        {first ? (
          <span aria-hidden="true" className="mt-3 flex h-[9.5rem] gap-1 overflow-hidden rounded-[14px]">
            <span className="min-w-0 flex-[2]">{photo(first)}</span>
            {second ? (
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="min-h-0 flex-1">{photo(second)}</span>
                {third ? (
                  <span className="relative min-h-0 flex-1">
                    {photo(third)}
                    {photos.length > 3 ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/45 font-display text-xl font-bold text-white">+{photos.length - 3}</span>
                    ) : null}
                  </span>
                ) : null}
              </span>
            ) : null}
          </span>
        ) : kitchen.description ? (
          <span className="mt-3 line-clamp-2 block text-[0.9375rem] leading-6 text-[#261A15]">{kitchen.description}</span>
        ) : null}

        <span className="mt-3 flex items-center justify-between gap-3 text-[0.9375rem]">
          <span className="min-w-0 truncate text-[#706864]">{[summary?.preparationTimeLabel, dishCount].filter(Boolean).join(" · ")}</span>
          {summary ? <span className="shrink-0 font-bold text-[#D92714]">From {summary.startingPriceLabel}</span> : null}
        </span>
      </button>
      <KitchenHeart kitchenId={kitchen.id} name={name} />
    </article>
  );
}

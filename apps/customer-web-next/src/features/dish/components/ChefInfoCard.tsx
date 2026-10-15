import { useEffect, useState } from "react";
import { ArrowUpRight, MapPin, Star, UtensilsCrossed } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { loadKitchenMenu } from "@/features/dish/api/dishes";
import { useKitchenProfile } from "@/shared/hooks/use-kitchen-profile";
import { ChefFace } from "@/shared/ui/data-display/ChefFace";

interface ChefInfoCardProps {
  chefId?: string;
  chefName: string;
  rating: number;
  reviewCount?: number | null;
  distanceMeters?: number;
  kitchenDescription?: string;
}

export function ChefInfoCard({
  chefId,
  chefName,
  rating,
  reviewCount = null,
  distanceMeters,
  kitchenDescription,
}: ChefInfoCardProps) {
  const { profile } = useKitchenProfile(chefId);
  const description = kitchenDescription ?? profile?.description;
  const [menu, setMenu] = useState<{ kitchenId: string; dishes: number } | null>(null);
  useEffect(() => {
    if (!chefId) return;
    let live = true;
    // Only the count is shown; reading it must not add the menu to the dishes Home lists.
    loadKitchenMenu(chefId, { remember: false }).then(
      (dishes) => { if (live) setMenu({ kitchenId: chefId, dishes: dishes.length }); },
      () => undefined,
    );
    return () => { live = false; };
  }, [chefId]);
  const menuDishes = menu && menu.kitchenId === chefId ? menu.dishes : 0;

  const distance =
    typeof distanceMeters === "number"
      ? distanceMeters < 1_000
        ? String(Math.round(distanceMeters)) + " m away"
        : (distanceMeters / 1_000).toFixed(1) + " km away"
      : "Distance unavailable";

  const reviewLabel =
    rating > 0 && reviewCount !== null
      ? rating.toFixed(1) +
        " · " +
        String(reviewCount) +
        " " +
        (reviewCount === 1 ? "review" : "reviews")
      : rating > 0
        ? rating.toFixed(1) + " rating"
        : reviewCount === 0
          ? "No reviews yet"
          : "Reviews unavailable";

  const content = (
    <section className="rounded-[1.6rem] border border-[#E5E7EB] bg-white p-4 shadow-[0_8px_28px_rgba(26,26,26,0.05)] transition-[border-color,box-shadow] duration-200 hover:border-[#D7DADF] hover:shadow-[0_14px_34px_rgba(26,26,26,0.10)] sm:p-5">
      <p className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-[#6B6B6B]">Prepared by</p>
      <div className="mt-2 flex items-center gap-3.5">
        <ChefFace photoUrl={profile?.chefPhotoUrl} name={chefName} size={56} />
        <div className="min-w-0 flex-1">
          <p className="mt-0.5 truncate font-display text-lg font-black tracking-[-0.025em] text-[#1A1A1A]">{chefName}</p>
          <p className="mt-1 text-xs font-semibold text-[#6B6B6B]">Freshly prepared by a Craves home chef</p>
        </div>
        {chefId ? (
          <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-[#F1F3F5] px-3 py-2 text-xs font-black text-[#1A1A1A] transition-colors group-hover:text-[#F62E18] sm:inline-flex">
            View kitchen
            <ArrowUpRight className="h-3.5 w-3.5 text-[#F62E18]" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      {description ? (
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#1A1A1A]">“{description}”</p>
      ) : null}

      <div className="mt-4 grid gap-2 border-t border-[#F1F3F5] pt-3 sm:auto-cols-fr sm:grid-flow-col">
        <span className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#F1F3F5] px-3 text-xs font-bold text-[#1A1A1A]">
          <Star className="h-4 w-4 fill-[#F62E18] text-[#F62E18]" aria-hidden="true" />
          {reviewLabel}
        </span>
        <span className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#F1F3F5] px-3 text-xs font-bold text-[#1A1A1A]">
          <MapPin className="h-4 w-4 text-[#F62E18]" strokeWidth={1.8} aria-hidden="true" />
          {distance}
        </span>
        {menuDishes ? (
          <span className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#F1F3F5] px-3 text-xs font-bold text-[#1A1A1A]">
            <UtensilsCrossed className="h-4 w-4 text-[#F62E18]" aria-hidden="true" />
            {menuDishes} {menuDishes === 1 ? "dish" : "dishes"} on the menu
          </span>
        ) : null}
      </div>
    </section>
  );

  return chefId ? (
    <Link
      to="/kitchen/$id"
      params={{ id: chefId }}
      className="group mt-5 block rounded-[1.6rem] focus:outline-none focus:ring-2 focus:ring-[#1A1A1A]/35"
      aria-label={"View " + chefName + " home kitchen"}
    >
      {content}
    </Link>
  ) : (
    <div className="mt-5">{content}</div>
  );
}

export default ChefInfoCard;

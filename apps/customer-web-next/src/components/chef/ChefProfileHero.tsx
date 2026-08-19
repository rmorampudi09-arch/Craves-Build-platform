import { ChefHat, MapPin, Star, UtensilsCrossed } from "lucide-react";
import type { Chef } from "@/services/api/chefs";

export function ChefProfileHero({ chef }: { chef: Chef }) {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-[#E5E7EB] bg-white p-6 shadow-[0_12px_34px_rgba(26,26,26,0.06)] md:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
          <ChefHat className="h-10 w-10" strokeWidth={2} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-[#F62E18]">Home kitchen</p>
          <h1 className="mt-1.5 font-display text-3xl font-black tracking-[-0.045em] text-[#1A1A1A] md:text-4xl">
            {chef.name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold text-[#6B6B6B]">
            {chef.location ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4 fill-[#F62E18] text-[#F62E18]" strokeWidth={1.4} aria-hidden="true" />
                {chef.location}
                {chef.distanceKm > 0 ? ` · ${chef.distanceKm} km away` : ""}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <UtensilsCrossed className="h-4 w-4 text-[#F62E18]" aria-hidden="true" />
              {chef.activeDishCount} active {chef.activeDishCount === 1 ? "dish" : "dishes"}
            </span>
            {chef.rating > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <Star className="h-4 w-4 fill-[#F62E18] text-[#F62E18]" aria-hidden="true" />
                {chef.rating.toFixed(1)}
                {chef.reviewCount > 0 ? ` (${chef.reviewCount} reviews)` : ""}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

export default ChefProfileHero;

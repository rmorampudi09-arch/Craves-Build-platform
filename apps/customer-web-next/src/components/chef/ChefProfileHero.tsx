import { ChefHat, Star, MapPin, BadgeCheck } from "lucide-react";
import type { Chef } from "@/services/api/chefs";

/** Chef profile hero card: avatar, name + verified badge, rating, distance, location. */
export function ChefProfileHero({ chef }: { chef: Chef }) {
  return (
    <section
      className="overflow-hidden rounded-2xl p-6 text-white"
      style={{ background: "var(--gradient-primary)" }}
    >
      <div className="flex items-center gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-white/20 backdrop-blur">
          <ChefHat className="h-10 w-10" />
        </div>
        <div>
          <h1 className="flex items-center gap-1.5 font-display text-2xl font-bold">
            {chef.name}
            {chef.verified && <BadgeCheck className="h-5 w-5 fill-white text-primary" />}
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-white/90">
            <Star className="h-4 w-4 fill-white text-white" /> {chef.rating}
            <span className="text-white/70">({chef.reviewCount} reviews)</span>
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-white/80">
            <MapPin className="h-3.5 w-3.5" /> {chef.location} · {chef.distanceKm} km away
          </p>
          {chef.verified && (
            <span className="mt-2 inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-semibold">
              Verified Home Chef
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

export default ChefProfileHero;

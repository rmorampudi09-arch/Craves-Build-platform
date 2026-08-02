import { Link } from "@tanstack/react-router";
import { ChefHat, Star, MapPin, BadgeCheck, ChevronRight } from "lucide-react";
import { getChefByName } from "@/services/api/chefs";

interface ChefInfoCardProps {
  chefName: string;
  rating: number;
}

/**
 * "Meet the chef" card: avatar, verified badge, rating + distance,
 * "Verified Home Chef" line, and a "View Chef" link to that chef's
 * full profile page (src/pages/public/ChefProfile/ChefProfile.tsx).
 */
export function ChefInfoCard({ chefName, rating }: ChefInfoCardProps) {
  const chef = getChefByName(chefName);
  const distanceKm = chef?.distanceKm ?? (1.2 + (chefName.length % 5) * 0.6).toFixed(1);

  return (
    <section className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ChefHat className="h-6 w-6" />
        </div>
        <div>
          <p className="flex items-center gap-1 font-semibold text-ink">
            {chefName} <BadgeCheck className="h-4 w-4 fill-primary text-primary-foreground" />
          </p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="h-3.5 w-3.5 fill-primary text-primary" /> {rating}
            <span className="mx-0.5">·</span>
            <MapPin className="h-3.5 w-3.5" /> {distanceKm} km away
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Verified Home Chef</p>
        </div>
      </div>
      <Link
        to="/chef/$id"
        params={{ id: chef?.id ?? "" }}
        className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:border-primary"
      >
        View Chef <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}

export default ChefInfoCard;

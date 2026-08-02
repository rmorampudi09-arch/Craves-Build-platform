import { ChefHat, Star, MapPin, BadgeCheck } from "lucide-react";

interface ChefInfoCardProps {
  chefName: string;
  rating: number;
  distanceMeters?: number;
}

export function ChefInfoCard({ chefName, rating, distanceMeters }: ChefInfoCardProps) {
  const distance = typeof distanceMeters === "number"
    ? distanceMeters < 1_000
      ? `${distanceMeters} m away`
      : `${(distanceMeters / 1_000).toFixed(1)} km away`
    : "Distance unavailable";

  return (
    <section className="mt-5 flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <ChefHat className="h-6 w-6" />
      </div>
      <div>
        <p className="flex items-center gap-1 font-semibold text-ink">
          {chefName} <BadgeCheck className="h-4 w-4 fill-primary text-primary-foreground" />
        </p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          {rating > 0 ? (
            <>
              <Star className="h-3.5 w-3.5 fill-primary text-primary" /> {rating}
              <span className="mx-0.5">·</span>
            </>
          ) : null}
          <MapPin className="h-3.5 w-3.5" /> {distance}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">Active Craves home kitchen</p>
      </div>
    </section>
  );
}

export default ChefInfoCard;

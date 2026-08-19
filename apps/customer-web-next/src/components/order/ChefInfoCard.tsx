import { ArrowUpRight, ChefHat, MapPin, Star } from "lucide-react";
import { Link } from "@tanstack/react-router";

interface ChefInfoCardProps {
  chefId?: string;
  chefName: string;
  rating: number;
  distanceMeters?: number;
}

export function ChefInfoCard({
  chefId,
  chefName,
  rating,
  distanceMeters,
}: ChefInfoCardProps) {
  const distance =
    typeof distanceMeters === "number"
      ? distanceMeters < 1_000
        ? `${Math.round(distanceMeters)} m away`
        : `${(distanceMeters / 1_000).toFixed(1)} km away`
      : "Distance unavailable";

  const content = (
    <section className="flex items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-4 transition hover:border-[#F62E18]/45 hover:shadow-[0_8px_24px_rgba(246,46,24,0.08)]">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
        <ChefHat className="h-6 w-6" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-black text-[#1A1A1A]">{chefName}</p>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-[#6B6B6B]">
          {rating > 0 ? (
            <>
              <Star className="h-3.5 w-3.5 fill-[#F62E18] text-[#F62E18]" aria-hidden="true" />
              {rating.toFixed(1)}
              <span>·</span>
            </>
          ) : null}
          <MapPin className="h-3.5 w-3.5 fill-[#F62E18] text-[#F62E18]" strokeWidth={1.4} aria-hidden="true" />
          {distance}
        </p>
        <p className="mt-1 text-[11px] font-semibold text-[#6B6B6B]">Active Craves home kitchen</p>
      </div>
      {chefId ? <ArrowUpRight className="h-4 w-4 shrink-0 text-[#F62E18]" aria-hidden="true" /> : null}
    </section>
  );

  return chefId ? (
    <Link
      to="/kitchen/$id"
      params={{ id: chefId }}
      className="mt-5 block rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#F62E18]/35"
      aria-label={`View ${chefName} home kitchen`}
    >
      {content}
    </Link>
  ) : (
    <div className="mt-5">{content}</div>
  );
}

export default ChefInfoCard;

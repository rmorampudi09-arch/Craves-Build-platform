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
    <section className="rounded-[1.6rem] border border-[#E5E7EB] bg-white p-4 shadow-[0_8px_28px_rgba(26,26,26,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#F62E18]/30 hover:shadow-[0_14px_34px_rgba(246,46,24,0.10)] sm:p-5">
      <div className="flex items-center gap-3.5">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.15rem] bg-[#F1F3F5] text-[#F62E18] shadow-[inset_0_0_0_1px_rgba(26,26,26,0.03)]">
          <ChefHat className="h-6 w-6" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#F62E18]">
            Home kitchen
          </p>
          <p className="mt-0.5 truncate font-display text-lg font-black tracking-[-0.025em] text-[#1A1A1A]">
            {chefName}
          </p>
          <p className="mt-1 text-xs font-semibold text-[#6B6B6B]">
            Freshly prepared by a Craves home chef
          </p>
        </div>

        {chefId ? (
          <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-[#F1F3F5] px-3 py-2 text-xs font-black text-[#1A1A1A] transition-colors group-hover:text-[#F62E18] sm:inline-flex">
            View kitchen
            <ArrowUpRight className="h-3.5 w-3.5 text-[#F62E18]" aria-hidden="true" />
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2 border-t border-[#F1F3F5] pt-3 sm:grid-cols-3">
        <span className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#F1F3F5] px-3 text-xs font-bold text-[#1A1A1A]">
          <Star className="h-4 w-4 fill-[#F62E18] text-[#F62E18]" aria-hidden="true" />
          {rating > 0 ? `${rating.toFixed(1)} rating` : "New kitchen"}
        </span>
        <span className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#F1F3F5] px-3 text-xs font-bold text-[#1A1A1A]">
          <MapPin className="h-4 w-4 text-[#F62E18]" strokeWidth={1.8} aria-hidden="true" />
          {distance}
        </span>
        <span className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#F1F3F5] px-3 text-xs font-bold text-[#1A1A1A]">
          <span className="h-2.5 w-2.5 rounded-full bg-[#2E7D32]" aria-hidden="true" />
          Active kitchen
        </span>
      </div>
    </section>
  );

  return chefId ? (
    <Link
      to="/kitchen/$id"
      params={{ id: chefId }}
      className="group mt-5 block rounded-[1.6rem] focus:outline-none focus:ring-2 focus:ring-[#F62E18]/35"
      aria-label={`View ${chefName} home kitchen`}
    >
      {content}
    </Link>
  ) : (
    <div className="mt-5">{content}</div>
  );
}

export default ChefInfoCard;

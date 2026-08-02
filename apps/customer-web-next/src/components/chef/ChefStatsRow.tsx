import { Award, BadgeCheck, MapPin, Package, Star } from "lucide-react";
import type { Chef } from "@/services/api/chefs";

export function ChefStatsRow({ chef }: { chef: Chef }) {
  const stats = chef.catalogBacked
    ? [
        {
          icon: Package,
          value: chef.activeDishCount,
          label: "Active Dishes",
        },
        {
          icon: MapPin,
          value: chef.distanceKm > 0 ? `${chef.distanceKm} km` : "Nearby",
          label: "Distance",
        },
        { icon: BadgeCheck, value: "Active", label: "Kitchen Status" },
      ]
    : [
        {
          icon: Award,
          value: `${chef.experienceYears} yrs`,
          label: "Experience",
        },
        {
          icon: Package,
          value: `${chef.ordersDelivered}+`,
          label: "Orders Delivered",
        },
        { icon: Star, value: chef.rating, label: "Avg. Rating" },
      ];

  return (
    <div className="mt-4 grid grid-cols-3 gap-2.5">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-xl border border-border bg-card px-3 py-3 text-center"
        >
          <stat.icon className="mx-auto h-5 w-5 text-primary" />
          <p className="mt-1 font-display text-lg font-bold text-ink">
            {stat.value}
          </p>
          <p className="text-[11px] text-muted-foreground">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}

export default ChefStatsRow;

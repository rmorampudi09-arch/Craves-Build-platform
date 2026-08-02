import { Award, Package, Star } from "lucide-react";
import type { Chef } from "@/services/api/chefs";

/** Row of 3 stat cards: years of experience, orders delivered, average rating. */
export function ChefStatsRow({ chef }: { chef: Chef }) {
  const stats = [
    { icon: Award, value: `${chef.experienceYears} yrs`, label: "Experience" },
    { icon: Package, value: `${chef.ordersDelivered}+`, label: "Orders Delivered" },
    { icon: Star, value: chef.rating, label: "Avg. Rating" },
  ];

  return (
    <div className="mt-4 grid grid-cols-3 gap-2.5">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-xl border border-border bg-card px-3 py-3 text-center"
        >
          <s.icon className="mx-auto h-5 w-5 text-primary" />
          <p className="mt-1 font-display text-lg font-bold text-ink">{s.value}</p>
          <p className="text-[11px] text-muted-foreground">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

export default ChefStatsRow;

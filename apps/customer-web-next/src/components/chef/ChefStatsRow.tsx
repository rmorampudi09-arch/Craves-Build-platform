import { Layers3, MapPin, Package } from "lucide-react";
import type { Chef } from "@/services/api/chefs";

export function ChefStatsRow({ chef }: { chef: Chef }) {
  const stats = [
    {
      icon: Package,
      value: chef.activeDishCount,
      label: "Available dishes",
    },
    {
      icon: Layers3,
      value: chef.specialties.length,
      label: "Menu categories",
    },
    {
      icon: MapPin,
      value: chef.distanceKm > 0 ? `${chef.distanceKm} km` : "—",
      label: "From your address",
    },
  ];

  return (
    <dl className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-2xl border border-[#E5E7EB] bg-white px-4 py-4 text-center"
        >
          <dt className="text-[0.68rem] font-semibold leading-4 text-[#6B6B6B]">
            <stat.icon className="mx-auto mb-1.5 h-5 w-5 text-[#F62E18]" aria-hidden="true" />
            {stat.label}
          </dt>
          <dd className="order-first font-display text-lg font-black text-[#1A1A1A]">
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default ChefStatsRow;

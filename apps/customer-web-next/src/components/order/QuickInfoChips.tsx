import { Clock, Flame, Users, Leaf, Drumstick } from "lucide-react";
import type { Dish } from "@/services/api/dishes";

export function QuickInfoChips({ dish }: { dish: Dish }) {
  const chips = [
    { icon: Clock, label: "Prep Time", value: dish.time },
    { icon: Flame, label: "Spice Level", value: dish.spiceLevel ?? "Not specified" },
    { icon: Users, label: "Serves", value: dish.serves ?? "Not specified" },
    {
      icon: dish.veg ? Leaf : Drumstick,
      label: "Type",
      value: dish.veg ? "Veg" : "Non-Veg",
    },
  ];

  return (
    <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {chips.map((chip) => (
        <div key={chip.label} className="rounded-2xl border border-[#E5E7EB] bg-white px-3 py-3">
          <chip.icon className="h-4 w-4 text-[#F62E18]" aria-hidden="true" />
          <p className="mt-1 text-[11px] font-semibold text-[#6B6B6B]">{chip.label}</p>
          <p className="text-sm font-black text-[#1A1A1A]">{chip.value}</p>
        </div>
      ))}
    </div>
  );
}

export default QuickInfoChips;

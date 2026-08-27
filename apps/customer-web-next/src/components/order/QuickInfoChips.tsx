import { Clock, Drumstick, EggFried, Flame, Leaf, Users } from "lucide-react";
import type { Dish } from "@/services/api/dishes";

export function QuickInfoChips({ dish }: { dish: Dish }) {
  const foodType = dish.foodType ?? (dish.veg ? "VEG" : "NON_VEG");
  const typeMeta =
    foodType === "VEG"
      ? { icon: Leaf, value: "Veg" }
      : foodType === "EGG"
        ? { icon: EggFried, value: "Egg" }
        : { icon: Drumstick, value: "Non-Veg" };

  const chips = [
    { icon: Clock, label: "Prep time", value: dish.time },
    { icon: Users, label: "Serves", value: dish.serves ?? "Not specified" },
    { icon: Flame, label: "Spice", value: dish.spiceLevel ?? "Not specified" },
    { icon: typeMeta.icon, label: "Food type", value: typeMeta.value },
  ];

  return (
    <div className="mt-5 grid grid-cols-2 gap-2.5">
      {chips.map((chip) => (
        <div
          key={chip.label}
          className="rounded-2xl border border-[#E5E7EB] bg-white px-3.5 py-3.5"
        >
          <chip.icon className="h-4 w-4 text-[#F62E18]" aria-hidden="true" />
          <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">
            {chip.label}
          </p>
          <p className="mt-0.5 text-sm font-black text-[#1A1A1A]">{chip.value}</p>
        </div>
      ))}
    </div>
  );
}

export default QuickInfoChips;

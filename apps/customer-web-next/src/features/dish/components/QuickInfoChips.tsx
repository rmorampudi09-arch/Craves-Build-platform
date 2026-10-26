import { Clock, Drumstick, EggFried, Flame, Leaf, Package, Users } from "lucide-react";
import type { Dish } from "@/features/dish/api/dishes";

export function QuickInfoChips({ dish }: { dish: Dish }) {
  const foodType = dish.foodType ?? (dish.veg ? "VEG" : "NON_VEG");
  // The food-type icon carries the same colour as the Veg, Egg and Non-veg marks on dish cards.
  const typeMeta =
    foodType === "VEG"
      ? { icon: Leaf, value: "Veg", iconColor: "text-[#2E7D32]" }
      : foodType === "EGG"
        ? { icon: EggFried, value: "Egg", iconColor: "text-[#D99A00]" }
        : { icon: Drumstick, value: "Non-veg", iconColor: "text-[#D92D20]" };

  const chips = [
    { icon: Clock, label: "Prep time", value: dish.time, iconColor: "text-[#F62E18]" },
    { icon: Users, label: "Serves", value: dish.serves ?? "Not specified", iconColor: "text-[#F62E18]" },
    { icon: Flame, label: "Spice", value: dish.spiceLevel ?? "Not specified", iconColor: "text-[#F62E18]" },
    { icon: typeMeta.icon, label: "Food type", value: typeMeta.value, iconColor: typeMeta.iconColor },
    // The app's "Pack 250 g", only when the kitchen gave the weight.
    ...(dish.packGrams ? [{ icon: Package, label: "Pack", value: `${dish.packGrams} g`, iconColor: "text-[#F62E18]" }] : []),
  ];

  return (
    <div className="mt-5 grid grid-cols-2 gap-2.5">
      {chips.map((chip) => (
        <div
          key={chip.label}
          className="rounded-2xl border border-[#E5E7EB] bg-white px-3.5 py-3.5"
        >
          <chip.icon className={`h-4 w-4 ${chip.iconColor}`} aria-hidden="true" />
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

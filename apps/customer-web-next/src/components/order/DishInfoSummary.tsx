import { Star } from "lucide-react";
import type { Dish } from "@/services/api/dishes";

/** Veg (green circle-in-square) / non-veg (red triangle-in-square) mark, Swiggy/Zomato-style. */
function VegMark({ veg }: { veg: boolean }) {
  return (
    <span
      className={`inline-flex h-5 w-5 items-center justify-center rounded border-2 bg-white align-middle ${
        veg ? "border-green-600" : "border-red-600"
      }`}
      aria-label={veg ? "Vegetarian" : "Non-vegetarian"}
    >
      {veg ? (
        <span className="h-2.5 w-2.5 rounded-full bg-green-600" />
      ) : (
        <span
          className="h-0 w-0 border-x-[5px] border-b-[8px] border-x-transparent border-b-red-600"
          style={{ marginBottom: 1 }}
        />
      )}
    </span>
  );
}

/** Name + veg mark, rating chip, and review count — the title row of the dish page. */
export function DishInfoSummary({ dish }: { dish: Dish }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-ink md:text-3xl">
          {dish.name} <VegMark veg={dish.veg} />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{dish.desc}</p>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-ink">
          <Star className="h-4 w-4 fill-primary text-primary" />
          <span className="font-semibold">{dish.rating}</span>
          {dish.reviewCount && (
            <span className="text-muted-foreground">· {dish.reviewCount} Reviews</span>
          )}
        </p>
      </div>
    </div>
  );
}

export default DishInfoSummary;

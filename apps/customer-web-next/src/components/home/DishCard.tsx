import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Clock3, MapPin, Plus, ShoppingBag } from "lucide-react";

import { addToCart } from "@/services/api/cravesCart";
import type { Dish } from "@/services/api/dishes";

function distanceLabel(distanceMeters?: number): string | null {
  if (typeof distanceMeters !== "number") return null;
  return distanceMeters < 1_000
    ? `${Math.round(distanceMeters)} m`
    : `${(distanceMeters / 1_000).toFixed(1)} km`;
}

function priceLabel(price: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(price);
}

export function DishCard({
  dish,
  variant = "standard",
}: {
  dish: Dish;
  variant?: "standard" | "featured";
}) {
  const [state, setState] = useState<"idle" | "adding" | "added" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const distance = distanceLabel(dish.distanceMeters);
  const featured = variant === "featured";

  const handleAdd = async () => {
    if (state === "adding") return;
    setState("adding");
    setMessage(null);
    try {
      await addToCart(
        {
          id: dish.id,
          name: dish.name,
          chef: dish.chef,
          price: dish.price,
          img: dish.img,
        },
        1,
      );
      setState("added");
      setMessage(`${dish.name} was added to the cart.`);
      window.setTimeout(() => setState("idle"), 1600);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "This dish could not be added to the cart.");
    }
  };

  return (
    <article
      className={`group flex h-full flex-col overflow-hidden border border-[#E9DBD1] bg-[#FFFDFC] shadow-[0_12px_36px_rgba(61,40,31,0.07)] transition duration-300 hover:-translate-y-1.5 hover:border-[#F62E18]/25 hover:shadow-[0_18px_42px_rgba(61,40,31,0.11)] ${
        featured ? "rounded-[2rem]" : "rounded-[1.65rem]"
      }`}
    >
      <div className={`relative overflow-hidden bg-[#F3EADF] ${featured ? "aspect-[16/10]" : "aspect-[4/3]"}`}>
        <Link
          to="/dish/$id"
          params={{ id: dish.id }}
          className="absolute inset-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#F62E18]/35 focus-visible:ring-inset"
          aria-label={`View ${dish.name} details`}
        >
          <img
            src={dish.img}
            alt={dish.name}
            width={1024}
            height={768}
            loading="lazy"
            className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.065]"
          />
        </Link>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#261A15]/60 via-[#261A15]/16 to-transparent" />

        <span className="pointer-events-none absolute left-3.5 top-3.5 rounded-full border border-white/55 bg-white/88 px-3 py-1.5 text-[0.64rem] font-black uppercase tracking-[0.09em] text-[#4B3931] shadow-sm backdrop-blur-md">
          {dish.category}
        </span>

        <span
          className={`pointer-events-none absolute bottom-3.5 left-3.5 inline-flex items-center gap-1.5 rounded-full bg-white/92 px-2.5 py-1.5 text-[0.65rem] font-black shadow-sm backdrop-blur-md ${
            dish.veg ? "text-[#198754]" : "text-[#B3261E]"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${dish.veg ? "bg-[#198754]" : "bg-[#B3261E]"}`}
            aria-hidden="true"
          />
          {dish.veg ? "Veg" : "Non-veg"}
        </span>

        {distance ? (
          <span className="pointer-events-none absolute bottom-3.5 right-3.5 inline-flex items-center gap-1 rounded-full bg-[#261A15]/86 px-2.5 py-1.5 text-[0.65rem] font-bold text-white backdrop-blur-md">
            <MapPin className="h-3 w-3 fill-current" strokeWidth={1.5} aria-hidden="true" />
            {distance}
          </span>
        ) : null}
      </div>

      <div className={`flex flex-1 flex-col ${featured ? "p-5" : "p-4.5"}`}>
        <div>
          <Link
            to="/dish/$id"
            params={{ id: dish.id }}
            className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/35"
          >
            <h3
              className={`font-display font-black leading-tight tracking-[-0.03em] text-[#261A15] transition-colors group-hover:text-[#C92716] ${
                featured ? "text-xl md:text-[1.35rem]" : "text-lg"
              }`}
            >
              {dish.name}
            </h3>
          </Link>
          <p className="mt-1.5 truncate text-xs font-bold text-[#8A746A]">{dish.chef}</p>
        </div>

        {dish.desc ? (
          <p className="mt-3 line-clamp-2 text-sm leading-5.5 text-[#756159]">{dish.desc}</p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.72rem] font-bold text-[#8A746A]">
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="h-3.5 w-3.5 text-[#F62E18]" aria-hidden="true" />
            {dish.time}
          </span>
          {dish.serves ? <span>{dish.serves}</span> : null}
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <div>
            <span className="block text-[0.62rem] font-black uppercase tracking-[0.12em] text-[#A28E84]">
              Price
            </span>
            <span className="font-display text-xl font-black tracking-[-0.03em] text-[#261A15]">
              {priceLabel(dish.price, dish.currency)}
            </span>
          </div>

          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={state === "adding"}
            className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full px-4 text-xs font-black transition duration-200 disabled:cursor-wait disabled:opacity-60 ${
              state === "added"
                ? "bg-[#198754] text-white"
                : "border border-[#F62E18] bg-white text-[#D82D1B] hover:-translate-y-0.5 hover:bg-[#F62E18] hover:text-white"
            }`}
            aria-label={`Add ${dish.name} to cart`}
          >
            {state === "adding" ? (
              <ShoppingBag className="h-4 w-4 animate-pulse" aria-hidden="true" />
            ) : state === "added" ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            {state === "adding" ? "Adding" : state === "added" ? "Added" : "Add"}
          </button>
        </div>

        {message ? (
          <p
            className={`mt-3 text-xs font-bold ${state === "error" ? "text-[#B3261E]" : "text-[#198754]"}`}
            role={state === "error" ? "alert" : "status"}
          >
            {message}
          </p>
        ) : null}
      </div>
    </article>
  );
}

export default DishCard;

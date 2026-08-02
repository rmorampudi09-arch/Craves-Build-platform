import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Clock, MapPin, Star } from "lucide-react";
import { addToCart } from "@/services/api/cravesCart";
import { WishlistHeartButton } from "@/components/order/WishlistHeartButton";
import type { Dish } from "@/services/api/dishes";

function distanceLabel(distanceMeters?: number): string | null {
  if (typeof distanceMeters !== "number") return null;
  return distanceMeters < 1_000
    ? `${distanceMeters} m`
    : `${(distanceMeters / 1_000).toFixed(1)} km`;
}

export function DishCard({ dish }: { dish: Dish }) {
  const [message, setMessage] = useState<string | null>(null);
  const distance = distanceLabel(dish.distanceMeters);
  const handleAdd = () => {
    void addToCart(
      {
        id: dish.id,
        name: dish.name,
        chef: dish.chef,
        price: dish.price,
        img: dish.img,
      },
      1,
    )
      .then(() => setMessage("Added"))
      .catch((error) =>
        setMessage(error instanceof Error ? error.message : "Could not add"),
      );
  };

  return (
    <article className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-lg">
      <div className="relative aspect-[4/3] overflow-hidden">
        <Link
          to="/dish/$id"
          params={{ id: dish.id }}
          className="absolute inset-0 focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label={`View ${dish.name} details`}
        >
          <img
            src={dish.img}
            alt={dish.name}
            width={1024}
            height={1024}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </Link>
        {dish.tag && (
          <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow">
            {dish.tag}
          </span>
        )}
        <WishlistHeartButton
          item={{
            id: dish.id,
            name: dish.name,
            chef: dish.chef,
            price: dish.price,
            img: dish.img,
          }}
          className="absolute right-3 top-3"
        />
        <span
          className={`pointer-events-none absolute bottom-3 left-3 flex h-6 w-6 items-center justify-center rounded border-2 bg-white ${dish.veg ? "border-green-600" : "border-red-600"}`}
          aria-label={dish.veg ? "Vegetarian" : "Non-vegetarian"}
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${dish.veg ? "bg-green-600" : "bg-red-600"}`}
          />
        </span>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-display text-lg font-bold leading-tight text-ink">
              {dish.name}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">by {dish.chef}</p>
          </div>
          {dish.rating > 0 ? (
            <div className="flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
              <Star className="h-3 w-3 fill-primary" /> {dish.rating}
            </div>
          ) : distance ? (
            <div className="flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
              <MapPin className="h-3 w-3" /> {distance}
            </div>
          ) : null}
        </div>
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
          {dish.desc}
        </p>
        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {dish.time}
          </span>
          <span>·</span>
          <span>₹{dish.price}</span>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="font-display text-xl font-bold text-ink">
            ₹{dish.price}
          </span>
          <button
            type="button"
            onClick={handleAdd}
            className="btn-primary rounded-lg px-4 py-2 text-xs"
          >
            {message === "Added" ? "Added ✓" : "Add to Cart +"}
          </button>
          {message && message !== "Added" && (
            <span className="sr-only" role="alert">
              {message}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

export default DishCard;

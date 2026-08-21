import { useCallback, useEffect, useState } from "react";
import { DishCard } from "@/components/home/DishCard";
import {
  loadCustomerFavoriteIds,
  removeCustomerFavorite,
  saveCustomerFavorite,
} from "@/services/api/customerFavorites";
import type { Dish } from "@/services/api/dishes";

interface ChefDishesGridProps {
  chefName: string;
  dishes: Dish[];
}

/** "Dishes by {chef}" heading + grid, reusing the same DishCard as the browse page. */
export function ChefDishesGrid({ chefName, dishes }: ChefDishesGridProps) {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favoritesReady, setFavoritesReady] = useState(false);

  useEffect(() => {
    let active = true;
    setFavoritesReady(false);

    void loadCustomerFavoriteIds()
      .then((ids) => {
        if (!active) return;
        setFavoriteIds(ids);
        setFavoritesReady(true);
      })
      .catch(() => {
        if (!active) return;
        setFavoriteIds(new Set());
        setFavoritesReady(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const toggleFavorite = useCallback(async (dish: Dish, nextFavorite: boolean) => {
    if (nextFavorite) {
      await saveCustomerFavorite(dish.id);
    } else {
      await removeCustomerFavorite(dish.id);
    }

    setFavoriteIds((current) => {
      const next = new Set(current);
      if (nextFavorite) next.add(dish.id);
      else next.delete(dish.id);
      return next;
    });
  }, []);

  if (dishes.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="font-display text-lg font-bold text-ink">Dishes by {chefName}</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {dishes.map((dish) => (
          <DishCard
            key={dish.id}
            dish={dish}
            favorite={favoriteIds.has(dish.id)}
            favoritesReady={favoritesReady}
            onToggleFavorite={toggleFavorite}
          />
        ))}
      </div>
    </section>
  );
}

export default ChefDishesGrid;

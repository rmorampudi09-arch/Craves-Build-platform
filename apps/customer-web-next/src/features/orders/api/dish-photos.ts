"use client";

import { useEffect, useState } from "react";
import { loadKitchenMenu } from "@/features/dish/api/dishes";

const menus = new Map<string, Promise<Map<string, string>>>();

/** Dish photos from the kitchen's menu, by menu item, read once per kitchen while the page is open. A dish no longer on the menu has none. */
function kitchenDishPhotos(kitchenId: string): Promise<Map<string, string>> {
  let photos = menus.get(kitchenId);
  if (!photos) {
    photos = loadKitchenMenu(kitchenId, { remember: false }).then(
      (dishes) => new Map(dishes.filter((dish) => !dish.imageIsPlaceholder && dish.img.startsWith("https://")).map((dish) => [dish.id, dish.img])),
    );
    // A failed read is tried again by the next card or page that asks.
    photos.catch(() => menus.delete(kitchenId));
    menus.set(kitchenId, photos);
  }
  return photos;
}

export function useDishPhotos(kitchenId: string | undefined): Map<string, string> {
  const [photos, setPhotos] = useState(() => new Map<string, string>());
  useEffect(() => {
    if (!kitchenId) return;
    let live = true;
    kitchenDishPhotos(kitchenId)
      .then((next) => {
        if (live) setPhotos(next);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [kitchenId]);
  return photos;
}

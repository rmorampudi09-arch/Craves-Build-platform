"use client";

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { formatDishPrice } from "@/shared/lib/kitchen-dish-summary";
import type { ListItem } from "../lib/food-list-contract";
import { listRowClass } from "./ListPaper";

const AVAILABILITY = { AVAILABLE: "Available now", UNAVAILABLE: "Not available right now", UNKNOWN: "Availability not known" } as const;

/** One dish on a ruled line: its name (a link to its page when the reader can open dish pages), whether it can be ordered now, and its price. */
export function DishLine({ item, linked, action }: { item: ListItem; linked: boolean; action?: ReactNode }) {
  const off = item.availability !== "AVAILABLE";
  const name = <span className={`block text-base font-semibold leading-snug ${off ? "text-[#6B6B6B]" : "text-[#1A1A1A]"}`}>{item.itemName}</span>;
  return (
    <div className={listRowClass}>
      <span className="min-w-0 flex-1">
        {linked ? (
          <Link to={`/dish/${item.menuItemId}`} className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A1A1A]">
            {name}
          </Link>
        ) : (
          name
        )}
        <span className={`block text-[0.8125rem] ${off ? "text-[#6B6B6B]" : "text-[#1B7F3B]"}`}>{AVAILABILITY[item.availability]}</span>
        {item.note ? <span className="block text-[0.8125rem] text-[#4A4A4A]">{item.note}</span> : null}
      </span>
      {item.pricePaise === null ? null : (
        <span className="shrink-0 text-[0.9375rem] font-semibold tabular-nums text-[#1A1A1A]">{formatDishPrice(item.pricePaise / 100)}</span>
      )}
      {action}
    </div>
  );
}

export const dishCount = (count: number) => `${count} ${count === 1 ? "dish" : "dishes"}`;

"use client";

import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { AutoHideCustomerHeader } from "@/shared/components/navigation/AutoHideCustomerHeader";
import { formatDishPrice } from "@/shared/lib/kitchen-dish-summary";
import type { ListItem } from "../lib/food-list-contract";
import { listRowClass } from "./ListPaper";

export function ListHeader({ title, backTo, backLabel }: { title: string; backTo: string; backLabel: string }) {
  return (
    <AutoHideCustomerHeader className="border-b border-[#E5E7EB] bg-white/95 shadow-[0_4px_18px_rgba(26,26,26,0.04)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3 md:px-6">
        <Link to={backTo} aria-label={backLabel} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#1A1A1A] transition-colors hover:bg-[#F1F3F5]">
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <p className="min-w-0 truncate text-lg font-black text-[#1A1A1A]">{title}</p>
      </div>
    </AutoHideCustomerHeader>
  );
}

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

export const outlineButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full !bg-white px-5 text-[0.9375rem] font-bold !text-[#C92716] !shadow-[inset_0_0_0_1.5px_#C92716] transition-colors hover:!bg-[#FDEAE8] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A1A1A]";

export const quietButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-[0.9375rem] font-bold text-[#1A1A1A] transition-colors hover:bg-[#F1F3F5] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A1A1A]";

export function signInPath(returnTo: string): string {
  return `/sign-in?returnTo=${encodeURIComponent(returnTo)}`;
}

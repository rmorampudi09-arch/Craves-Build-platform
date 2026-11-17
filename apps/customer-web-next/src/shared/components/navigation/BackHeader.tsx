"use client";

import { ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { AutoHideCustomerHeader } from "@/shared/components/navigation/AutoHideCustomerHeader";
import { PreviousPageBack } from "@/shared/components/navigation/PreviousPageBack";

/**
 * A page's top bar: a back link and the page's name; it hides while scrolling down, as the other customer pages do.
 * Back returns to the Craves page the person came from; `backTo` is only for a tab opened straight on this page.
 */
export function BackHeader({ title, backTo, backLabel }: { title: string; backTo: string; backLabel: string }) {
  return (
    <AutoHideCustomerHeader className="border-b border-[#E5E7EB] bg-white/95 shadow-[0_4px_18px_rgba(26,26,26,0.04)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3 md:px-6">
        <PreviousPageBack>
          <Link to={backTo} aria-label={backLabel} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#1A1A1A] transition-shadow hover:shadow-[0_6px_16px_rgba(26,26,26,0.10)]">
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
        </PreviousPageBack>
        <p className="min-w-0 truncate text-lg font-black text-[#1A1A1A]">{title}</p>
      </div>
    </AutoHideCustomerHeader>
  );
}

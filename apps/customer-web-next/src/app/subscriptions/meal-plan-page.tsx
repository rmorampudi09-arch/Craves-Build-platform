import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { CravesLogo } from "@/shared/components/brand/CravesLogo";
import { AutoHideCustomerHeader } from "@/shared/components/navigation/AutoHideCustomerHeader";

/** White meal-plan page: back link, one h1, optional one-line intro. */
export function MealPlanPage({
  title,
  intro,
  back,
  backLabel,
  children,
}: {
  title: string;
  intro?: string;
  back: string;
  backLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white pb-24 text-[#1A1A1A]">
      <AutoHideCustomerHeader className="border-b border-[#E5E7EB] bg-white/95 shadow-[0_4px_18px_rgba(26,26,26,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-5xl items-center gap-3 px-4 py-2.5 md:px-6">
          <Link
            href={back}
            aria-label={backLabel}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#1A1A1A]"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <Link href="/home" aria-label="Craves home" className="hidden shrink-0 rounded-xl md:flex">
            <CravesLogo size="sm" decorative />
          </Link>
          <h1 className="min-w-0 truncate text-lg font-black tracking-[-0.02em] text-[#1A1A1A] md:text-xl">
            {title}
          </h1>
        </div>
      </AutoHideCustomerHeader>
      <main className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
        {intro ? <p className="mb-6 max-w-2xl text-sm leading-6 text-[#6B6B6B]">{intro}</p> : null}
        {children}
      </main>
    </div>
  );
}

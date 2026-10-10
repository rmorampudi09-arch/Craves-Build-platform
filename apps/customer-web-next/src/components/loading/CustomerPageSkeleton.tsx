"use client";

import Link from "next/link";
import { CravesLogo } from "@/components/brand/CravesLogo";
import styles from "./CustomerPageSkeleton.module.css";

export type CustomerPageSkeletonVariant = "home" | "dish" | "kitchen" | "cart" | "chefs";

function SkeletonBlock({
  className = "",
  soft = false,
}: {
  className?: string;
  soft?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={[
        styles.block,
        soft ? styles.soft : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

function CardSkeleton({ media = "aspect-[16/10]" }: { media?: string }) {
  return (
    <div
      className="overflow-hidden rounded-[1.2rem] border border-[#E5E7EB] bg-white"
      aria-hidden="true"
    >
      <SkeletonBlock className={`${media} w-full rounded-none`} />
      <div className="space-y-2.5 p-3.5">
        <SkeletonBlock className="h-4 w-2/3 rounded-full" soft />
        <SkeletonBlock className="h-3 w-1/2 rounded-full" soft />
        <div className="flex items-center justify-between gap-3 pt-1">
          <SkeletonBlock className="h-3 w-20 rounded-full" soft />
          <SkeletonBlock className="h-8 w-16 rounded-[0.65rem]" />
        </div>
      </div>
    </div>
  );
}

function HomeBody() {
  return (
    <div className="mx-auto max-w-[88rem] px-4 pb-8 pt-3 md:px-7 md:pt-4 lg:px-10">
      <div className="md:hidden">
        <SkeletonBlock className="h-12 w-full rounded-[1rem]" />
        <div className="mt-3 flex gap-3 overflow-hidden">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="shrink-0">
              <SkeletonBlock className="h-[4.4rem] w-[4.4rem] rounded-full" />
              <SkeletonBlock className="mx-auto mt-2 h-2.5 w-12 rounded-full" soft />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 hidden md:block">
        <SkeletonBlock className="aspect-[1983/793] w-full rounded-[1.6rem] lg:rounded-[1.9rem]" />
      </div>

      <div className="mt-5 hidden gap-4 md:flex lg:gap-6">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="shrink-0 text-center">
            <SkeletonBlock className="h-[5.2rem] w-[5.2rem] rounded-full lg:h-[6.2rem] lg:w-[6.2rem]" />
            <SkeletonBlock className="mx-auto mt-2 h-3 w-14 rounded-full" soft />
          </div>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 md:mt-7 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <CardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}

/** Photo, facts and price like the dish page, plus its bottom bar so the tab bar never flashes. */
function DishBody() {
  return (
    <>
      <div className="mx-auto max-w-6xl px-4 pt-5 md:px-6 md:pt-7">
        <div className="grid gap-7 lg:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.9fr)]">
          <div>
            <SkeletonBlock className="aspect-[4/3] w-full rounded-[1.65rem] md:aspect-[16/10] md:rounded-[2rem]" />
            <SkeletonBlock className="mt-3 h-11 w-full rounded-2xl" soft />
            <div className="mt-5 flex items-center gap-3">
              <SkeletonBlock className="h-12 w-12 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <SkeletonBlock className="h-4 w-1/2 rounded-full" />
                <SkeletonBlock className="h-3 w-1/3 rounded-full" soft />
              </div>
            </div>
          </div>
          <div className="space-y-3 rounded-[1.8rem] border border-[#E5E7EB] p-5">
            <SkeletonBlock className="h-7 w-3/4 rounded-full" />
            <SkeletonBlock className="h-3.5 w-full rounded-full" soft />
            <SkeletonBlock className="h-3.5 w-5/6 rounded-full" soft />
            <SkeletonBlock className="mt-4 h-9 w-28 rounded-full" />
          </div>
        </div>
      </div>
      <div
        data-craves-action-bar
        className="fixed inset-x-0 bottom-0 border-t border-[#E5E7EB] bg-white px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 lg:hidden"
      >
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <div className="space-y-1.5">
            <SkeletonBlock className="h-2.5 w-14 rounded-full" soft />
            <SkeletonBlock className="h-5 w-20 rounded-full" />
          </div>
          <SkeletonBlock className="h-11 w-28 rounded-full" soft />
          <SkeletonBlock className="ml-auto h-12 flex-1 rounded-full" />
        </div>
      </div>
    </>
  );
}

function KitchenBody() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-5 md:px-6 md:pt-7">
      <div className="rounded-[1.75rem] border border-[#E5E7EB] p-5 sm:p-6 md:rounded-[2rem] md:p-7">
        <SkeletonBlock className="h-3 w-32 rounded-full" soft />
        <SkeletonBlock className="mt-3 h-8 w-2/3 rounded-full" />
        <SkeletonBlock className="mt-4 h-3.5 w-full max-w-xl rounded-full" soft />
        <SkeletonBlock className="mt-2 h-3.5 w-4/5 max-w-lg rounded-full" soft />
        <div className="mt-5 grid grid-cols-2 gap-2.5 lg:max-w-[27rem]">
          {Array.from({ length: 4 }, (_, index) => (
            <SkeletonBlock key={index} className="h-20 rounded-2xl" soft />
          ))}
        </div>
      </div>
      <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <CardSkeleton key={index} media="aspect-[16/9] sm:aspect-[16/10]" />
        ))}
      </div>
    </div>
  );
}

/** Kitchen row, item rows with steppers, notes, and the fixed Continue bar. */
function CartBody() {
  return (
    <>
      <div className="mx-auto max-w-2xl px-4 pt-5 md:px-6 md:pt-7">
        <div className="rounded-[8px] border border-[#E5E7EB] px-4">
          <div className="flex items-center gap-3 border-b border-[#F1F3F5] py-4">
            <SkeletonBlock className="h-11 w-11 shrink-0 rounded-full" soft />
            <SkeletonBlock className="h-4 w-40 rounded-full" />
          </div>
          {Array.from({ length: 2 }, (_, index) => (
            <div
              key={index}
              className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-3 border-b border-[#F1F3F5] py-4 last:border-b-0"
            >
              <SkeletonBlock className="aspect-square w-[4.75rem] rounded-[8px]" />
              <div className="space-y-2">
                <SkeletonBlock className="h-4 w-3/4 rounded-full" />
                <SkeletonBlock className="h-3 w-1/2 rounded-full" soft />
                <SkeletonBlock className="h-4 w-16 rounded-full" />
              </div>
              <div className="col-span-2 flex items-center justify-between">
                <SkeletonBlock className="h-12 w-32 rounded-[8px]" soft />
                <SkeletonBlock className="h-4 w-20 rounded-full" soft />
              </div>
            </div>
          ))}
        </div>
        <SkeletonBlock className="mt-4 h-24 w-full rounded-[8px]" soft />
      </div>
      <div className="fixed inset-x-0 bottom-0 border-t border-[#E5E7EB] bg-white px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto flex max-w-4xl items-center gap-4">
          <div className="space-y-1.5">
            <SkeletonBlock className="h-2.5 w-12 rounded-full" soft />
            <SkeletonBlock className="h-6 w-20 rounded-full" />
          </div>
          <SkeletonBlock className="ml-auto h-12 flex-1 rounded-full sm:max-w-52" />
        </div>
      </div>
    </>
  );
}

function ChefsBody() {
  return (
    <div className="mx-auto max-w-[88rem] px-4 pt-3 md:px-7 md:pt-4 lg:px-10">
      <SkeletonBlock className="h-3 w-36 rounded-full" soft />
      <SkeletonBlock className="mt-3 h-8 w-64 max-w-full rounded-full" />
      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <CardSkeleton key={index} media="aspect-[16/9]" />
        ))}
      </div>
    </div>
  );
}

const BODIES: Record<CustomerPageSkeletonVariant, () => React.ReactNode> = {
  home: HomeBody,
  dish: DishBody,
  kitchen: KitchenBody,
  cart: CartBody,
  chefs: ChefsBody,
};

export function CustomerPageSkeleton({
  label = "Loading Craves",
  variant = "home",
}: {
  label?: string;
  /** Shaped like the page being loaded, so content replaces it without a jump. */
  variant?: CustomerPageSkeletonVariant;
}) {
  const Body = BODIES[variant];
  return (
    <main
      className="h-[100dvh] overflow-hidden bg-white text-[#1A1A1A]"
      aria-busy="true"
      role="status"
      aria-label={label}
    >
      <div className="border-b border-[#E5E7EB] bg-white px-4 py-3 md:px-7 lg:px-10">
        <div className="mx-auto flex max-w-[88rem] items-center gap-3">
          <Link
            href="/home"
            className="shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/30"
            aria-label="Craves home"
          >
            <CravesLogo size="sm" decorative />
          </Link>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            <SkeletonBlock className="h-10 w-44 rounded-[1rem]" soft />
            <SkeletonBlock className="h-10 w-72 rounded-[1rem]" />
            <SkeletonBlock className="h-10 w-20 rounded-[1rem]" soft />
            <SkeletonBlock className="h-10 w-10 rounded-full" soft />
          </div>
          <div className="ml-auto flex items-center gap-2 md:hidden">
            <SkeletonBlock className="h-9 w-24 rounded-full" soft />
            <SkeletonBlock className="h-9 w-9 rounded-full" soft />
          </div>
        </div>
      </div>

      <Body />
      <span className="sr-only">{label}</span>
    </main>
  );
}

export default CustomerPageSkeleton;

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CravesLogo } from "@/shared/components/brand/CravesLogo";
import styles from "./CustomerPageSkeleton.module.css";

export type CustomerPageSkeletonVariant = "home" | "dish" | "kitchen" | "cart" | "chefs";
/** Bodies for pages that keep their real header while the content loads. */
export type CustomerSectionSkeletonVariant =
  | "profile"
  | "notifications"
  | "saved"
  | "checkout"
  | "plans"
  | "plan-form"
  | "plan-details";

/** Waits past this point are explained (NN/g: over 10 s, say what is happening). */
const SLOW_LOAD_MS = 10_000;

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

/** One status line for screen readers; after 10 s it becomes visible and says what to check. */
function SkeletonStatus({ label }: { label: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_LOAD_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <p
      role="status"
      className={
        slow
          ? "mx-auto mb-4 mt-1 w-fit rounded-full border border-[#E5E7EB] bg-white px-4 py-2 text-center text-sm font-semibold text-[#1A1A1A]"
          : "sr-only"
      }
    >
      {slow ? "Still loading. Check your internet connection." : label}
    </p>
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

/** Search row (phones), banner, craving circles, then the kitchens list, in Home's order. */
function HomeBody() {
  return (
    <div className="mx-auto max-w-[88rem] px-4 pb-8 pt-3 md:px-7 md:pt-4 lg:px-10">
      <div className="flex gap-2 md:hidden">
        <SkeletonBlock className="h-12 flex-1 rounded-[1rem]" />
        <SkeletonBlock className="h-12 w-[5.5rem] rounded-[1rem]" soft />
      </div>

      <SkeletonBlock className="mt-3 aspect-[1983/793] w-full rounded-[1.45rem] md:rounded-[1.7rem] lg:rounded-[2rem]" />

      <SkeletonBlock className="mt-6 h-6 w-52 rounded-full" />
      <div className="mt-3 flex gap-3 overflow-hidden md:gap-4 lg:gap-6">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="shrink-0 text-center">
            <SkeletonBlock className="h-[4.4rem] w-[4.4rem] rounded-full md:h-[5.2rem] md:w-[5.2rem] lg:h-[6.2rem] lg:w-[6.2rem]" />
            <SkeletonBlock className="mx-auto mt-2 h-3 w-12 rounded-full" soft />
          </div>
        ))}
      </div>

      <SkeletonBlock className="mt-8 h-7 w-60 max-w-full rounded-full" />
      <SkeletonBlock className="mt-2 h-3.5 w-72 max-w-full rounded-full" soft />
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <CardSkeleton key={index} media="aspect-[16/9]" />
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

/** Icon, two lines and a trailing chevron or round button: Profile's link cards. */
function LinkRowSkeleton({ trailingButton = false }: { trailingButton?: boolean }) {
  return (
    <div className="flex min-h-[76px] items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-3.5 sm:p-4">
      <SkeletonBlock className="h-11 w-11 shrink-0 rounded-full" soft />
      <div className="min-w-0 flex-1 space-y-2">
        <SkeletonBlock className="h-4 w-2/5 rounded-full" />
        <SkeletonBlock className="h-3 w-3/5 rounded-full" soft />
      </div>
      <SkeletonBlock
        className={trailingButton ? "h-10 w-10 shrink-0 rounded-full" : "h-4 w-4 shrink-0 rounded-full"}
        soft
      />
    </div>
  );
}

function ProfileBody() {
  return (
    <>
      <div className="rounded-[1.6rem] border border-[#E5E7EB] bg-white p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <SkeletonBlock className="h-14 w-14 shrink-0 rounded-full" />
          <SkeletonBlock className="h-6 w-40 rounded-full" />
          <SkeletonBlock className="ml-auto h-10 w-10 shrink-0 rounded-full" soft />
        </div>
        <div className="mt-4 space-y-1 rounded-2xl border border-[#F1F3F5] p-2">
          {[0, 1].map((row) => (
            <div key={row} className="flex items-center gap-3 p-2">
              <SkeletonBlock className="h-9 w-9 shrink-0 rounded-full" soft />
              <div className="flex-1 space-y-1.5">
                <SkeletonBlock className="h-2.5 w-20 rounded-full" soft />
                <SkeletonBlock className="h-3.5 w-40 max-w-full rounded-full" />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 border-t border-[#F1F3F5] pt-4">
          {[0, 1].map((stat) => (
            <div key={stat} className="flex flex-col items-center gap-2">
              <SkeletonBlock className="h-3 w-16 rounded-full" soft />
              <SkeletonBlock className="h-5 w-6 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      <SkeletonBlock className="mt-7 h-5 w-64 max-w-full rounded-full" />
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <LinkRowSkeleton trailingButton />
        <LinkRowSkeleton />
        <LinkRowSkeleton />
        <LinkRowSkeleton />
      </div>

      <SkeletonBlock className="mt-7 h-5 w-56 max-w-full rounded-full" />
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <LinkRowSkeleton />
        <LinkRowSkeleton />
      </div>
    </>
  );
}

/** Action chips, filter tabs, a day heading and notice cards (also used inside Chef Mode). */
function NotificationsBody() {
  return (
    <>
      <div className="mb-6">
        <div className="mb-3 flex flex-wrap justify-end gap-2">
          <SkeletonBlock className="h-9 w-32 rounded-full" />
          <SkeletonBlock className="h-9 w-24 rounded-full" />
          <SkeletonBlock className="h-9 w-20 rounded-full" />
        </div>
        <div className="flex gap-6 border-b border-[#E5E7EB] px-3 pb-3 pt-2">
          <SkeletonBlock className="h-4 w-12 rounded-full" />
          <SkeletonBlock className="h-4 w-16 rounded-full" />
          <SkeletonBlock className="h-4 w-14 rounded-full" />
        </div>
      </div>
      <SkeletonBlock className="mb-3 h-3.5 w-14 rounded-full" />
      <div className="space-y-3">
        {[0, 1, 2].map((card) => (
          <div key={card} className="flex gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-4">
            <SkeletonBlock className="h-10 w-10 shrink-0 rounded-xl" soft />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-4 w-1/2 rounded-full" />
              <SkeletonBlock className="h-3 w-full rounded-full" soft />
              <SkeletonBlock className="h-3 w-4/5 rounded-full" soft />
              <SkeletonBlock className="!mt-4 h-9 w-28 rounded-full" soft />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/** Count line and saved-dish rows: photo, name, kitchen, price, remove and Add. */
function SavedBody() {
  return (
    <>
      <SkeletonBlock className="h-3.5 w-28 rounded-full" soft />
      <div className="mt-4 space-y-3">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-3">
            <SkeletonBlock className="h-[82px] w-[82px] shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-4 w-3/4 rounded-full" />
              <SkeletonBlock className="h-3 w-1/2 rounded-full" soft />
              <SkeletonBlock className="h-4 w-16 rounded-full" />
            </div>
            <div className="flex shrink-0 flex-col items-end gap-3">
              <SkeletonBlock className="h-9 w-9 rounded-full" soft />
              <SkeletonBlock className="h-9 w-16 rounded-full" soft />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[1.25rem] border border-[#E5E7EB] bg-white p-4 md:p-5">{children}</div>;
}

function SectionCardHead({ action = false }: { action?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <SkeletonBlock className="h-10 w-10 shrink-0 rounded-full" soft />
      <SkeletonBlock className="h-5 w-36 rounded-full" />
      {action ? <SkeletonBlock className="ml-auto h-10 w-28 rounded-full" soft /> : null}
    </div>
  );
}

/** Address choices, delivery timing and the bill, with the phone's fixed Pay bar. */
function CheckoutBody() {
  return (
    <>
      <SkeletonBlock className="mb-6 hidden h-8 w-72 rounded-full lg:block" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-start lg:gap-7 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-5">
          <SectionCard>
            <SectionCardHead action />
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {[0, 1].map((option) => (
                <div key={option} className="flex gap-3 rounded-xl border border-[#E5E7EB] p-3.5">
                  <SkeletonBlock className="mt-0.5 h-4 w-4 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <SkeletonBlock className="h-4 w-24 rounded-full" />
                    <SkeletonBlock className="h-3 w-full rounded-full" soft />
                    <SkeletonBlock className="h-3 w-3/4 rounded-full" soft />
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
          <SectionCard>
            <SectionCardHead />
            <SkeletonBlock className="mt-4 h-24 w-full rounded-xl" soft />
          </SectionCard>
        </div>
        <SectionCard>
          <SectionCardHead />
          <div className="mt-4 space-y-3">
            {[0, 1, 2, 3].map((line) => (
              <div key={line} className="flex justify-between">
                <SkeletonBlock className="h-3.5 w-28 rounded-full" soft />
                <SkeletonBlock className="h-3.5 w-14 rounded-full" soft />
              </div>
            ))}
            <div className="flex justify-between border-t border-[#F1F3F5] pt-3">
              <SkeletonBlock className="h-4 w-20 rounded-full" />
              <SkeletonBlock className="h-4 w-16 rounded-full" />
            </div>
          </div>
        </SectionCard>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[#E5E7EB] bg-white px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 lg:hidden">
        <div className="mx-auto flex max-w-4xl items-center gap-4">
          <div className="space-y-1.5">
            <SkeletonBlock className="h-5 w-20 rounded-full" />
            <SkeletonBlock className="h-2.5 w-14 rounded-full" soft />
          </div>
          <SkeletonBlock className="ml-auto h-12 flex-1 rounded-full sm:max-w-60" />
        </div>
      </div>
    </>
  );
}

function PlanCardSkeleton() {
  return (
    <div className="flex flex-col rounded-2xl border border-[#E5E7EB] bg-white p-5">
      <SkeletonBlock className="h-3 w-16 rounded-full" soft />
      <SkeletonBlock className="mt-3 h-6 w-3/4 rounded-full" />
      <SkeletonBlock className="mt-3 h-3.5 w-full rounded-full" soft />
      <SkeletonBlock className="mt-2 h-3.5 w-4/5 rounded-full" soft />
      <div className="mt-6 flex items-center justify-between gap-3">
        <SkeletonBlock className="h-6 w-24 rounded-full" />
        <SkeletonBlock className="h-11 w-32 rounded-full" />
      </div>
    </div>
  );
}

function PlansBody() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((plan) => (
        <PlanCardSkeleton key={plan} />
      ))}
    </div>
  );
}

function PlanFormBody() {
  return (
    <div className="max-w-xl rounded-2xl border border-[#E5E7EB] bg-white p-5 sm:p-6">
      <SkeletonBlock className="h-3 w-24 rounded-full" soft />
      <SkeletonBlock className="mt-3 h-6 w-2/3 rounded-full" />
      <SkeletonBlock className="mt-3 h-3.5 w-full rounded-full" soft />
      {[0, 1, 2].map((field) => (
        <div key={field} className="mt-5">
          <SkeletonBlock className="h-3.5 w-28 rounded-full" />
          <SkeletonBlock className="mt-2 h-12 w-full rounded-xl" soft />
        </div>
      ))}
      <SkeletonBlock className="mt-6 h-12 w-full rounded-full sm:w-48" />
    </div>
  );
}

/** Status and dates card, then the Manage card, like the meal plan page. */
function PlanDetailsBody() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <SkeletonBlock className="h-6 w-20 rounded-full" soft />
          <SkeletonBlock className="h-10 w-24 rounded-full" soft />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((fact) => (
            <div key={fact} className="space-y-1.5">
              <SkeletonBlock className="h-3 w-16 rounded-full" soft />
              <SkeletonBlock className="h-4 w-32 rounded-full" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 sm:p-6">
        <SkeletonBlock className="h-5 w-40 rounded-full" />
        <SkeletonBlock className="mt-3 h-3.5 w-full rounded-full" soft />
        <SkeletonBlock className="mt-2 h-3.5 w-2/3 rounded-full" soft />
        <div className="mt-5 flex flex-wrap gap-2">
          <SkeletonBlock className="h-11 w-36 rounded-full" />
          <SkeletonBlock className="h-11 w-28 rounded-full" soft />
        </div>
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

const SECTION_BODIES: Record<CustomerSectionSkeletonVariant, () => React.ReactNode> = {
  profile: ProfileBody,
  notifications: NotificationsBody,
  saved: SavedBody,
  checkout: CheckoutBody,
  plans: PlansBody,
  "plan-form": PlanFormBody,
  "plan-details": PlanDetailsBody,
};

/**
 * A whole page while it loads: Craves header plus a body shaped like the page being opened,
 * so content replaces it without a jump.
 */
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
    <div className="h-[100dvh] overflow-hidden bg-white text-[#1A1A1A]">
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

      <main aria-busy="true" aria-label={label}>
        <SkeletonStatus label={label} />
        <Body />
      </main>
    </div>
  );
}

/**
 * The content area of a page that keeps its own header while loading (Profile, Notifications,
 * Saved, Checkout, meal plans). Render it where the content goes; the page keeps Back working.
 */
export function CustomerSectionSkeleton({
  variant,
  label,
}: {
  variant: CustomerSectionSkeletonVariant;
  label: string;
}) {
  const Body = SECTION_BODIES[variant];
  return (
    <div aria-busy="true">
      <SkeletonStatus label={label} />
      <Body />
    </div>
  );
}

export default CustomerPageSkeleton;

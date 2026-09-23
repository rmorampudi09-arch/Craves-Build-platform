"use client";

import { CravesLogo } from "@/components/brand/CravesLogo";
import styles from "./CustomerPageSkeleton.module.css";

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

export function CustomerPageSkeleton({
  label = "Loading Craves",
}: {
  label?: string;
}) {
  return (
    <main
      className="h-[100dvh] overflow-hidden bg-white text-[#1A1A1A]"
      aria-busy="true"
      role="status"
      aria-label={label}
    >
      <div className="border-b border-[#E5E7EB] bg-white/95 px-4 py-3 md:px-7 lg:px-10">
        <div className="mx-auto flex max-w-[88rem] items-center gap-3">
          <CravesLogo size="sm" decorative />
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
            <div
              key={index}
              className="overflow-hidden rounded-[1.2rem] border border-[#E5E7EB] bg-white"
              aria-hidden="true"
            >
              <SkeletonBlock className="aspect-[16/10] w-full rounded-none" />
              <div className="space-y-2.5 p-3.5">
                <SkeletonBlock className="h-4 w-2/3 rounded-full" soft />
                <SkeletonBlock className="h-3 w-1/2 rounded-full" soft />
                <div className="flex items-center justify-between gap-3 pt-1">
                  <SkeletonBlock className="h-3 w-20 rounded-full" soft />
                  <SkeletonBlock className="h-8 w-16 rounded-[0.65rem]" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <span className="sr-only">{label}</span>
      </div>
    </main>
  );
}

export default CustomerPageSkeleton;

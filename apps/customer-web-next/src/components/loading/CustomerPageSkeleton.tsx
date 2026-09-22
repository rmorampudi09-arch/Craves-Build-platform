"use client";

import { CravesLogo } from "@/components/brand/CravesLogo";

export function CustomerPageSkeleton({
  label = "Loading Craves",
}: {
  label?: string;
}) {
  return (
    <main
      className="min-h-screen bg-white px-4 pb-24 pt-4 text-[#1A1A1A] md:px-7 lg:px-10"
      aria-busy="true"
      role="status"
      aria-label={label}
    >
      <div className="mx-auto max-w-[88rem]">
        <div className="flex items-center justify-between gap-4">
          <CravesLogo size="sm" decorative />
          <div className="h-10 w-28 animate-pulse rounded-full bg-[#F1F3F5]" />
        </div>

        <div className="mt-4 aspect-[1200/487] w-full animate-pulse rounded-[1.45rem] bg-[#F1F3F5] md:rounded-[1.7rem]" />

        <div className="mt-8 flex gap-3 overflow-hidden">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="shrink-0 text-center" aria-hidden="true">
              <div className="h-[5.35rem] w-[5.35rem] animate-pulse rounded-full bg-[#F1F3F5]" />
              <div className="mx-auto mt-2 h-3 w-14 animate-pulse rounded-full bg-[#F1F3F5]" />
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="overflow-hidden rounded-[1.5rem] border border-[#E5E7EB] bg-white"
              aria-hidden="true"
            >
              <div className="aspect-[16/10] animate-pulse bg-[#F1F3F5]" />
              <div className="space-y-3 p-4">
                <div className="h-5 w-2/3 animate-pulse rounded-full bg-[#F1F3F5]" />
                <div className="h-3.5 w-1/2 animate-pulse rounded-full bg-[#F1F3F5]" />
                <div className="h-9 w-full animate-pulse rounded-full bg-[#F1F3F5]" />
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

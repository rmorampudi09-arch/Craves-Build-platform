"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/shared/ui/feedback/EmptyState";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [copied, setCopied] = useState(false);
  const reference = error.digest;
  // Read once on mount (the page is client-only), so the copy matches the likely cause.
  const [offline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="flex max-w-md flex-col items-center text-center">
        <EmptyState
          illustration={offline ? "offline" : "loadError"}
          heading="h1"
          title={offline ? "You’re offline" : "This page didn’t load"}
          message={
            offline
              ? "Check your Wi‑Fi or mobile data, then try again."
              : "Something went wrong on our side while loading it. Try again; if it keeps happening, chat with support and share the reference below."
          }
          className="py-0 md:py-0"
        >
          <button type="button" onClick={reset} className="craves-primary-action">Try again</button>
        </EmptyState>
        <p className="mt-4 text-sm leading-6 text-[#6B6B6B]">
          Your cart, orders and payments are safe. Nothing was repeated or charged again.
        </p>
        {reference ? (
          <p className="mt-4 inline-flex max-w-full items-center gap-2 rounded-full bg-[#F1F3F5] py-1 pl-4 pr-1 text-sm text-[#1A1A1A]">
            <span className="min-w-0 truncate">
              Reference: <span className="select-all font-mono font-semibold">{reference}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(reference).then(() => setCopied(true), () => undefined);
              }}
              className="!min-h-9 shrink-0 rounded-full !border-0 !bg-white px-3 text-xs font-bold !text-[#1A1A1A] !shadow-none"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap justify-center gap-x-5">
          <Link href="/home" className="inline-flex min-h-11 items-center text-sm font-bold text-[#1A1A1A] underline underline-offset-4">
            Go to home
          </Link>
          <Link href="/support" className="inline-flex min-h-11 items-center text-sm font-bold text-[#1A1A1A] underline underline-offset-4">
            Chat with support
          </Link>
        </div>
      </div>
    </main>
  );
}

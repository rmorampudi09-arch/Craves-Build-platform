"use client";

import Link from "next/link";
import { useState } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [copied, setCopied] = useState(false);
  const reference = error.digest;

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-2xl font-bold text-[#1A1A1A]">This page didn&apos;t load</h1>
        <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">Please try again. No payment or order action was repeated automatically.</p>
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
        <div className="mt-6 flex flex-col items-center gap-3">
          <button type="button" onClick={reset} className="craves-primary-action">Try again</button>
          <Link href="/contact" className="inline-flex min-h-11 items-center text-sm font-bold text-[#1A1A1A] underline underline-offset-4">
            Contact support
          </Link>
        </div>
      </div>
    </main>
  );
}

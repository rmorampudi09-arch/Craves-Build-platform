"use client";

import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";
import { ArrowLeft, Check, Info } from "lucide-react";
import { getSession, subscribeSession } from "@/features/auth/api/cravesAuth";
import { deletionCopy } from "@/features/account-deletion/domain/deletion-copy";
import type { DeletionSide } from "@/features/account-deletion/domain/deletion-types";
import { AutoHideCustomerHeader } from "@/shared/components/navigation/AutoHideCustomerHeader";

export const cardClass = "space-y-2 rounded-[20px] border border-[#E5E7EB] bg-white p-4";
export const labelClass = "text-xs font-bold uppercase tracking-wide text-[#6B6B6B]";

/** A tinted note: amber for what the person should know, green for what stays. */
export function DeletionNote({ tone, text }: { tone: "warning" | "success"; text: string }) {
  const Icon = tone === "success" ? Check : Info;
  return (
    <p className={`flex items-start gap-2 rounded-2xl p-3 text-sm leading-6 ${tone === "success" ? "bg-[#E8F5EC] text-[#0E7C3A]" : "bg-[#FFF6E5] text-[#7A4D0B]"}`}>
      <Icon className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}

/**
 * The page around every step, laid out like Settings. Its Sign out is the only one a person who signed in just to
 * delete can reach while the customer launch lock is on; the screen owns its dialog, which outlives a change of step.
 */
export function DeletionPage({ side, title, onSignOut, children }: { side: DeletionSide; title: string; onSignOut: () => void; children: ReactNode }) {
  const signedIn = useSyncExternalStore(subscribeSession, () => getSession() !== null, () => false);
  const back = side === "chef" ? "/chef/security" : side === "customer" ? "/settings" : "/account-deletion";
  return (
    <div className="min-h-screen bg-white pb-12 text-[#1A1A1A]">
      <AutoHideCustomerHeader className="border-b border-[#E5E7EB] bg-white/95 shadow-[0_4px_18px_rgba(26,26,26,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3 md:px-6">
          <Link
            href={back}
            aria-label={deletionCopy.unavailable.back}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#1A1A1A] transition-colors hover:bg-[#F1F3F5]"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <h1 className="font-display text-2xl font-bold tracking-[-0.02em]">{title}</h1>
        </div>
      </AutoHideCustomerHeader>
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pb-8 pt-6 md:px-6">{children}</main>
      {signedIn ? (
        <footer className="mx-auto flex max-w-2xl justify-center px-4 md:px-6">
          <button
            type="button"
            data-craves-borderless="true"
            onClick={onSignOut}
            className="!bg-transparent px-4 text-sm font-semibold text-[#6B6B6B] underline !shadow-none"
          >
            {deletionCopy.unavailable.signOut}
          </button>
        </footer>
      ) : null}
    </div>
  );
}

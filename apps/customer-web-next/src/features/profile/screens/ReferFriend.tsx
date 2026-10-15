"use client";

import { Link } from "@tanstack/react-router";
import { ArrowLeft, Copy, Ellipsis, Link as LinkIcon, MessageCircle } from "lucide-react";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { FaWhatsapp } from "react-icons/fa6";

import {
  INVITATION_LINK,
  INVITATION_MESSAGE,
  INVITATION_TEXT,
  smsShareUrl,
  whatsappShareUrl,
} from "@/features/profile/lib/invitation";
import { AutoHideCustomerHeader } from "@/shared/components/navigation/AutoHideCustomerHeader";

const noSubscription = () => () => undefined;
const OPTION = "flex min-w-0 flex-col items-center gap-2 rounded-xl py-1 text-xs font-semibold text-[#6B6B6B] transition-colors hover:text-[#1A1A1A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/30 disabled:cursor-wait disabled:opacity-60";

function OptionIcon({ green = false, children }: { green?: boolean; children: ReactNode }) {
  return (
    <span className={`flex h-[52px] w-[52px] items-center justify-center rounded-full ${green ? "bg-[#17803D] text-white" : "bg-[#F1F3F5] text-[#6B6B6B]"}`}>
      {children}
    </span>
  );
}

function Step({ number, title, detail }: { number: number; title: string; detail: string }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-xs font-black">{number}</span>
      <span>
        <span className="block text-sm font-black">{title}</span>
        <span className="block text-xs leading-5 text-[#6B6B6B]">{detail}</span>
      </span>
    </li>
  );
}

/** Refer a friend: share a plain Craves invitation (no rewards or tracking, as in the app). */
export function ReferFriend() {
  // The system share sheet exists only in some browsers; "More" is hidden elsewhere.
  const canShare = useSyncExternalStore(noSubscription, () => typeof navigator.share === "function", () => false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function run(action: () => Promise<string>) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      setNotice(await action());
    } finally {
      setBusy(false);
    }
  }

  const copy = (link: boolean) => run(async () => {
    try {
      await navigator.clipboard.writeText(link ? INVITATION_LINK : INVITATION_MESSAGE);
      return link ? "Link copied" : "Message copied";
    } catch {
      return `Copying is unavailable on this device.${canShare ? " You can use More to share instead." : ""}`;
    }
  });

  const share = () => run(async () => {
    try {
      await navigator.share({ text: INVITATION_TEXT });
      return "";
    } catch (error) {
      // Closing the share sheet is not a failure.
      return error instanceof DOMException && error.name === "AbortError" ? "" : "Could not open share options. Please try again.";
    }
  });

  return (
    <div className="min-h-screen bg-white pb-12 text-[#1A1A1A]">
      <AutoHideCustomerHeader className="border-b border-[#E5E7EB] bg-white/95 shadow-[0_4px_18px_rgba(26,26,26,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4 md:px-6">
          <Link
            to="/profile"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#1A1A1A] transition-colors hover:text-[#F62E18]"
            aria-label="Back to profile"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <h1 className="font-display text-xl font-black tracking-[-0.03em]">Refer a friend</h1>
        </div>
      </AutoHideCustomerHeader>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-5 md:px-6">
        <p className="px-1 text-sm text-[#6B6B6B]">Share Craves with someone you know.</p>

        <section aria-labelledby="refer-message" className="rounded-2xl border border-[#E5E7EB] p-4">
          <h2 id="refer-message" className="font-display text-base font-black">Your invitation</h2>
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-[#F1F3F5] p-3">
            <p className="min-w-0 flex-1 text-sm leading-6">{INVITATION_MESSAGE}</p>
            <button
              type="button"
              onClick={() => void copy(false)}
              disabled={busy}
              aria-label="Copy invitation message"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#1A1A1A] transition-colors hover:text-[#F62E18] disabled:cursor-wait disabled:opacity-60"
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </section>

        <section aria-labelledby="refer-share" className="rounded-2xl border border-[#E5E7EB] p-4">
          <h2 id="refer-share" className="font-display text-base font-black">Share options</h2>
          <div className={`mt-4 grid gap-2 ${canShare ? "grid-cols-4" : "grid-cols-3"}`}>
            <a href={whatsappShareUrl(INVITATION_TEXT)} target="_blank" rel="noopener noreferrer" className={OPTION}>
              <OptionIcon green><FaWhatsapp className="text-[28px]" aria-hidden="true" /></OptionIcon>
              WhatsApp
            </a>
            <a href={smsShareUrl(INVITATION_TEXT)} className={OPTION}>
              <OptionIcon green><MessageCircle className="h-7 w-7 fill-current" aria-hidden="true" /></OptionIcon>
              Messages
            </a>
            <button type="button" onClick={() => void copy(true)} disabled={busy} className={OPTION}>
              <OptionIcon><LinkIcon className="h-6 w-6" aria-hidden="true" /></OptionIcon>
              Copy link
            </button>
            {canShare ? (
              <button type="button" onClick={() => void share()} disabled={busy} className={OPTION}>
                <OptionIcon><Ellipsis className="h-7 w-7" aria-hidden="true" /></OptionIcon>
                More
              </button>
            ) : null}
          </div>
          <p role="status" className="mt-3 min-h-5 text-center text-xs font-semibold text-[#6B6B6B]">{notice}</p>
        </section>

        <section aria-labelledby="refer-how" className="rounded-2xl border border-[#E5E7EB] p-4">
          <h2 id="refer-how" className="font-display text-base font-black">How it works</h2>
          <ol className="mt-3 space-y-3">
            <Step number={1} title="Send your invitation" detail="Choose WhatsApp, Messages or another app to share it." />
            <Step number={2} title="Let them discover Craves" detail="They explore meals from home chefs." />
          </ol>
        </section>
      </main>
    </div>
  );
}
